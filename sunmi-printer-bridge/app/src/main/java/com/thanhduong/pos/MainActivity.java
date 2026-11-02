package com.thanhduong.pos;

import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import net.posprinter.posprinterface.IMyBinder;
import net.posprinter.posprinterface.TaskCallback;
import net.posprinter.service.PosprinterService;
import net.posprinter.utils.PosPrinterDev;

import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "MainActivityPOS";
    private static final String ACTION_USB_PERMISSION = "com.thanhduong.pos.USB_PERMISSION";
    private static final String PREF_SERVER_URL = "pref_server_url";
    private static final String DEFAULT_SERVER_URL = "http://192.168.1.22:5173"; // Local dev or Render URL

    public static IMyBinder myBinder;
    public static boolean IS_CONNECTED = false;
    public static String CURRENT_USB_PATH = "";

    private WebView webView;
    private ProgressBar progressBar;
    private TextView tvPrinterStatus;
    private View topBar;
    private SharedPreferences prefs;
    private UsbManager usbManager;

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            myBinder = (IMyBinder) service;
            Log.i(TAG, "PosprinterService bound successfully.");
            autoConnectUsbPrinter();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            myBinder = null;
            IS_CONNECTED = false;
            Log.w(TAG, "PosprinterService disconnected.");
            updateStatusText("Dịch vụ in bị ngắt");
        }
    };

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (ACTION_USB_PERMISSION.equals(action)) {
                synchronized (this) {
                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        Log.i(TAG, "USB Permission granted for device: " + device);
                        autoConnectUsbPrinter();
                    } else {
                        Log.w(TAG, "USB Permission denied for device: " + device);
                        Toast.makeText(context, "Quyền USB bị từ chối!", Toast.LENGTH_SHORT).show();
                    }
                }
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                Log.i(TAG, "USB Device Attached");
                Toast.makeText(context, "Đã cắm máy in ZYWELL USB!", Toast.LENGTH_SHORT).show();
                autoConnectUsbPrinter();
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                Log.i(TAG, "USB Device Detached");
                IS_CONNECTED = false;
                CURRENT_USB_PATH = "";
                updateStatusText("Mất kết nối máy in USB");
                Toast.makeText(context, "Máy in ZYWELL bị rút cáp USB!", Toast.LENGTH_SHORT).show();
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences("pos_settings", MODE_PRIVATE);
        usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);

        initViews();
        setupWebView();
        bindPrinterService();
        registerUsbReceivers();
    }

    private void initViews() {
        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        topBar = findViewById(R.id.topBar);
        tvPrinterStatus = findViewById(R.id.tvPrinterStatus);

        Button btnTestPrint = findViewById(R.id.btnTestPrint);
        Button btnConfigServer = findViewById(R.id.btnConfigServer);

        btnTestPrint.setOnClickListener(v -> {
            ZywellPrinterBridge bridge = new ZywellPrinterBridge(this);
            String res = bridge.printTestReceipt();
            Toast.makeText(this, res, Toast.LENGTH_SHORT).show();
        });

        btnConfigServer.setOnClickListener(v -> showServerConfigDialog());
    }

    private void setupWebView() {
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);

        // Inject Native ZywellBridge
        webView.addJavascriptInterface(new ZywellPrinterBridge(this), "ZywellBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }
        });

        String targetUrl = prefs.getString(PREF_SERVER_URL, DEFAULT_SERVER_URL);
        Log.i(TAG, "Loading POS URL: " + targetUrl);
        webView.loadUrl(targetUrl);
    }

    private void bindPrinterService() {
        Intent intent = new Intent(this, PosprinterService.class);
        bindService(intent, serviceConnection, BIND_AUTO_CREATE);
    }

    private void registerUsbReceivers() {
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        registerReceiver(usbReceiver, filter);
    }

    public void autoConnectUsbPrinter() {
        if (myBinder == null) {
            Log.w(TAG, "myBinder is null, cannot connect.");
            return;
        }

        List<String> usbPaths = PosPrinterDev.GetUsbPathNames(this);
        if (usbPaths == null || usbPaths.isEmpty()) {
            updateStatusText("Chưa cắm cáp USB máy in ZYWELL");
            IS_CONNECTED = false;
            return;
        }

        final String targetPath = usbPaths.get(0);
        CURRENT_USB_PATH = targetPath;
        updateStatusText("Đang kết nối: " + targetPath);

        // Check permission
        for (UsbDevice device : usbManager.getDeviceList().values()) {
            if (!usbManager.hasPermission(device)) {
                int flags = 0;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    flags = PendingIntent.FLAG_IMMUTABLE;
                }
                PendingIntent pi = PendingIntent.getBroadcast(this, 0, new Intent(ACTION_USB_PERMISSION), flags);
                usbManager.requestPermission(device, pi);
                return;
            }
        }

        myBinder.ConnectUsbPort(getApplicationContext(), targetPath, new TaskCallback() {
            @Override
            public void OnSucceed() {
                IS_CONNECTED = true;
                runOnUiThread(() -> {
                    updateStatusText("🟢 Máy in ZYWELL USB đã sẵn sàng (" + targetPath + ")");
                    Toast.makeText(MainActivity.this, "Máy in ZYWELL đã sẵn sàng!", Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void OnFailed() {
                IS_CONNECTED = false;
                runOnUiThread(() -> {
                    updateStatusText("🔴 Kết nối USB thất bại");
                });
            }
        });
    }

    private void updateStatusText(final String text) {
        runOnUiThread(() -> {
            if (tvPrinterStatus != null) {
                tvPrinterStatus.setText(text);
            }
        });
    }

    private void showServerConfigDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("Cấu hình địa chỉ POS Server");

        final EditText input = new EditText(this);
        input.setText(prefs.getString(PREF_SERVER_URL, DEFAULT_SERVER_URL));
        builder.setView(input);

        builder.setPositiveButton("Lưu & Tải lại", (dialog, which) -> {
            String newUrl = input.getText().toString().trim();
            if (!newUrl.isEmpty()) {
                prefs.edit().putString(PREF_SERVER_URL, newUrl).apply();
                webView.loadUrl(newUrl);
            }
        });

        builder.setNegativeButton("Hủy", (dialog, which) -> dialog.cancel());
        builder.show();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            new AlertDialog.Builder(this)
                    .setTitle("Thanh Dương Quán POS")
                    .setMessage("Bạn có chắc chắn muốn thoát ứng dụng?")
                    .setPositiveButton("Thoát", (d, w) -> finish())
                    .setNegativeButton("Không", null)
                    .show();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        try {
            unregisterReceiver(usbReceiver);
        } catch (Exception ignored) {}
        try {
            unbindService(serviceConnection);
        } catch (Exception ignored) {}
    }
}
