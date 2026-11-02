export interface DiningTableData {
  id: string;
  code: string;
  display_name: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';
  sort_order: number;
  active_session_id?: string | null;
  running_subtotal?: number | null;
  session_opened_at?: string | null;
  order_count?: number;
  active_table_codes?: string[];
  payment_status?: 'AVAILABLE' | 'UNPAID' | 'PAID';
  invoice_status?: 'DRAFT' | 'PAID' | string | null;
  invoice_number?: string | null;
  invoice_id?: string | null;
}

export interface ProductData {
  id: string;
  name: string;
  description?: string;
  sale_price: number;
  is_available: boolean;
  is_archived: boolean;
}

export interface OrderItemData {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  note?: string;
  status: 'ACTIVE' | 'CANCELLED';
  created_at: string;
  cancelled_at?: string;
  cancellation_reason?: string;
}

export interface SessionDetails {
  id: string;
  status: 'OPEN' | 'CLOSED';
  opened_by_id: string;
  created_at: string;
  tables: Array<{ id: string; code: string; display_name: string }>;
  active_items: OrderItemData[];
  cancelled_items: OrderItemData[];
  running_subtotal: number;
}

export interface InvoiceData {
  id: string;
  invoice_number: string;
  session_id: string;
  status: 'DRAFT' | 'PAID';
  subtotal: number;
  discount_total: number;
  total_after_discount: number;
  adjustment_total: number;
  final_total: number;
  created_at: string;
  items?: Array<{
    id: string;
    product_name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
  }>;
  payments?: Array<{
    id: string;
    method: string;
    amount: number;
    status: string;
    created_at: string;
  }>;
}

export interface VietQrMockData {
  invoice_id: string;
  invoice_number: string;
  amount: number;
  bank_name: string;
  account_no: string;
  account_name: string;
  transfer_content: string;
  mock_qr_url: string;
  status: string;
}

export interface ReceiptData {
  restaurant_name: string;
  tagline: string;
  address: string;
  phone: string;
  invoice_number: string;
  invoice_id: string;
  date_time: string;
  table_names: string[];
  cashier_name: string;
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
  subtotal: number;
  discount_total: number;
  total_after_discount: number;
  adjustment_total: number;
  final_total: number;
  payments: Array<{
    method: string;
    amount: number;
    status: string;
    time: string;
  }>;
  total_paid: number;
  balance_due: number;
  difference: number;
  thank_you_note: string;
  qr_code_url?: string;
  formatted_text?: string;
}
