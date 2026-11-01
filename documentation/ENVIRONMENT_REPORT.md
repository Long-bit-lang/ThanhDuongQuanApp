# Android / SUNMI / ZYWELL environment report

Checked on 2026-11-01 (Asia/Ho_Chi_Minh). This report records observed results only; it does not claim a physical printer test that has not occurred.

## 1. Ubuntu and development host

| Item | Result |
| --- | --- |
| OS | Ubuntu 26.04.1 LTS (resolute) |
| CPU architecture | x86_64 |
| RAM | 7.1 GiB total; 2.3 GiB available when checked |
| Root disk | 159 GiB total; 51 GiB available |
| VS Code | 1.138.0, x64 |
| Java runtime before configuration | OpenJDK 25.0.4.1 |
| Java compiler before configuration | javac 17.0.20.1 |

JDK 17 was already installed, so no package installation or `sudo` change was needed. The original `java`/`javac` alternatives were inconsistent. New Bash terminals now select the existing JDK 17 consistently:

```text
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
java 17.0.20.1
javac 17.0.20.1
```

The following user-level settings were added to `~/.bashrc`:

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=/home/nhlong/Android/Sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```

Open a new VS Code integrated terminal (or run `source ~/.bashrc`) after this change.

## 2. Android SDK

Android Studio and the Android Emulator were not installed.

The official Google Command-line Tools package `commandlinetools-linux-15859902_latest.zip` was downloaded, and its SHA-256 was verified against Google's published value:

```text
4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583
```

It is installed at `/home/nhlong/Android/Sdk/cmdline-tools/latest`. All SDK licenses were accepted. `sdkmanager --list_installed` verified these packages:

| Package | Version | Reason |
| --- | --- | --- |
| Command-line Tools | 22.0 (reports package revision 23.0.0) | SDK management |
| Platform Tools | 37.0.1 | `adb` and physical device deployment |
| Android SDK Platform 23 | revision 3 | SUNMI T1-G's Android 6.0.1 / API 23 runtime |
| Android SDK Platform 33 | revision 3 | required by the official ZYWELL demo |
| Android Build-Tools | 33.0.2 | required by the official ZYWELL demo |

The official ZYWELL Java demo was built successfully with `bash ./gradlew assembleDebug --no-daemon` using JDK 17. It produced `app/build/outputs/apk/debug/app-debug.apk` (4,400,019 bytes). The ZIP did not preserve the executable permission on `gradlew`, so invoking it through Bash was necessary; no project code or Gradle version was changed.

`minSdkVersion` is the oldest Android release that may install an APK; `compileSdkVersion` is the API used at compile time; `targetSdkVersion` is the compatibility behavior an app declares. The official ZYWELL demo declares `minSdkVersion 19`, `compileSdkVersion 33`, and `targetSdkVersion 33`; API 23 therefore meets its declared minimum. This is compatibility evidence, not yet a physical SUNMI verification.

## 3. VS Code

VS Code is installed. The following requested extensions were **not** installed because no separate authorization was given for extension installation:

- Extension Pack for Java (`vscjava.vscode-java-pack`)
- Gradle for Java (`vscjava.vscode-gradle`)

They are the recommended, publisher-maintained extensions for editing this Java Gradle project. No unverified Android extension is recommended or installed.

## 4. Official ZYWELL SDK and documentation

The official download page is https://www.zywell.com/sdk and the ZY-Q822 product page is https://www.zywell.com/zywell-zy-q822-desktop-thermal-receipt-printer. Original downloads are preserved in `/home/nhlong/Downloads/zywell-sdk/` and a copy plus extracted inspection tree is in `../zywell-sdk/` relative to this report.

| File | SHA-256 | Result |
| --- | --- | --- |
| `Android_SDK.zip` | `e0b02af4f95f7709938dd36314143d0971dc91459dfc5ec89719eb5cbc0d7cd6` | Valid ZIP; SDK and demo extracted |
| `Receipt_Manual.zip` | `2ac533dc7e5126845ce2f563f1f48f8486170abf5a82e9ef7413ec61e8e343b2` | Valid ZIP; receipt manual and instruction-set PDF extracted |
| `80mm_Program_Manual.zip` | `081f5284594064f1527d789687f955ab7573ffdfbf6a2d6abb55950b01f08ef5` | Valid but empty ZIP; official server supplied no manual content |

The extracted SDK includes:

- `AndroidSDK/SDK/PosPrinterSDK.jar`
- demo `AndroidPosPrintDemo` (Java source and sample APKs)
- Gradle wrapper 7.3.3 and Android Gradle Plugin 7.2.2
- PDF files `(User Manual)ReceiptManual.pdf` and `（Instruction Set）80mmProgramManual.pdf`
- no AAR or native `.so` library found.

## 5. Confirmed SDK integration surface

This section is based on actual source and `javap` output from `PosPrinterSDK.jar`, not guessed names.

- USB host: demo declares `android.hardware.usb.host`, enumerates `UsbManager.getDeviceList()`, calls `UsbManager.requestPermission(...)`, and receives the permission broadcast. It then calls `IMyBinder.ConnectUsbPort(Context, String, TaskCallback)`.
- Device discovery: `PosPrinterDev.GetUsbPathNames(Context)` and `IMyBinder.OnDiscovery(PortType, Context)` are present.
- Sending print data: `IMyBinder.WriteSendData(...)` and `WriteDataByUSB(...)` are present. The demo uses `StringUtils.strTobytes(...)` together with `DataForSendToPrinterPos80` commands.
- QR: `DataForSendToPrinterPos80.printQRcode(int, int, String)` is present and used in the 80 mm demo.
- Cutter: `DataForSendToPrinterPos80.selectCutPagerModerAndCutPager(...)` is present and used in the 80 mm demo, including a feed-and-cut call.
- Charset: `DataForSendToPrinterPos80.setCharsetName(String)` is present. Vietnamese output has **not** been validated on the actual ZY-Q822. It must be tested with a Vietnamese receipt after USB connection is established; rasterized text is a fallback if the printer font/code page cannot render it.

The official product page lists ZY-Q822 as USB or USB+LAN, ESC/POS emulation, Android SDK availability, QR support and an auto-cutter. Together with the official demo, this provides a credible SDK-first approach. The exact USB VID/PID and successful communication remain unverified until the physical printer is attached to the SUNMI in USB-host mode.

## 6. ADB / SUNMI T1-G

The SDK `adb` is working:

```text
Android Debug Bridge version 1.0.41
Version 37.0.1-15733141
```

Outside the sandbox, `adb start-server` succeeded. `adb devices -l` returned an empty device list, so the SUNMI was not attached, authorized, or visible at the time of test.

To complete this check on the device: enable **Developer options → USB debugging**, connect a data-capable USB cable, accept the RSA fingerprint prompt on SUNMI, then run `adb devices -l`. This laptop has the `android-udev-rules` package installed; no udev modification was made.

ADB is the laptop-to-SUNMI development connection. It is separate from the SUNMI USB-host-to-ZYWELL-printer connection and should not be used to infer the latter works.

## 7. Outstanding work and safe next step

1. Install the two recommended VS Code extensions if approved.
2. Connect SUNMI by USB and repeat `adb devices -l`.
3. Connect ZY-Q822 to SUNMI's USB host port, inspect VID/PID and SDK discovery, grant the Android USB permission, then run one text, QR and cutter test.
4. Only after those hardware checks, create the deliberately minimal printer test app; do not yet start the restaurant-management application.

| Item | Status | Evidence |
| --- | --- | --- |
| Java | Completed | JDK 17 runtime/compiler selected in new Bash terminal |
| Android SDK | Completed | Command-line Tools, platform-tools, API 23/33, Build Tools 33.0.2 installed |
| VS Code | Checked; extensions pending | VS Code 1.138.0 installed; requested Java/Gradle extensions absent |
| ZYWELL SDK | Completed | Official ZIP downloaded, checksum recorded, JAR/demo/PDFs inspected |
| Android API 23 | Completed | `platforms;android-23` installed; ZYWELL demo minSdk is 19 |
| ADB | Checked; device pending | daemon starts; `adb devices -l` has no attached device |
| USB integration feasibility | Ready for physical verification | official USB host demo and SDK APIs confirmed; no printer connection test yet |
