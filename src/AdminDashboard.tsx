import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Printer,
  FileText,
  ArrowLeft,
  Check,
  ChevronRight,
  LayoutDashboard,
  List,
  PrinterIcon,
  BarChart2,
  HardDrive,
  Settings,
  
  Search,
  LogIn,
  LogOut,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  Download,
  Play,
  RefreshCw,
  TrendingUp,
  Package,
  Clock,
  CheckCircle2,
  Users,
  FolderOpen,
  AlertCircle,
  Plus,
  X,
  Wallet,
  QrCode,
  Printer as PrinterIcon2,
  Ban,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart3,
} from "lucide-react";
import {
  AdminBg,
  Card,
  Btn,
  Input,
  Textarea,
  Badge,
  StatusBadge,
  ProgressBar,
  Divider,
  Avatar,
  IconChip,
  Table,
  Modal,
  Toggle,
  BarChart,
  StatCard,
} from "./ui";
import { G, O, T } from "./tokens";
import { FileEditorWorkspace } from "./FileEditorWorkspace";
import { MenuManager } from "./MenuManager";

// ─────────────────────────────────────────────────────────────────────
// NOTE ON BACKEND INTEGRATION (read me before wiring real data)
// Orders and ledger data are loaded through the `adminApi` object below.
// Real printer detection is handled by adminApi.getPrinters().
// This file does not implement auth/session/DB/websockets itself;
// those concerns remain in the backend.

// ─────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────

type AScreen =
  | "login"
  | "dashboard"
  | "orders"
  | "order-detail"
  | "queue"
  | "ledger"
  | "reports"
  | "storage"
  | "settings"
  | "file-editor";

// Real workflow: no payment stages here — Customer Portal has no online payment.
export type OrderStatus =
  "received" | "reviewing" | "printing" | "ready" | "completed" | "cancelled";

export interface UploadedFile {
  id: number;
  orderId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  pages?: number;
  copies?: number;
  createdAt: string;
}

/**
 * Constructs a fully qualified URL for accessing an uploaded file
 * served by the backend uploads directory.
 */
export function getUploadedFileUrl(storedName: string): string {
  if (!storedName) return "";
  return `http://localhost:5000/uploads/${encodeURIComponent(storedName)}`;
}

export function getUploadedFilePreviewUrl(storedName: string, mimeType: string): string {
  const isNative = mimeType === "application/pdf" || mimeType.startsWith("image/");
  return isNative
    ? getUploadedFileUrl(storedName)
    : `http://localhost:5000/api/files/preview/${encodeURIComponent(storedName)}`;
}

/**
 * Formats a file size in bytes to a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Triggers a file download by fetching the file as a blob first,
 * bypassing cross-origin restrictions that prevent the 'download'
 * attribute from working on cross-origin URLs.
 */
async function downloadUploadedFile(storedName: string, originalName: string) {
  try {
    const url = getUploadedFileUrl(storedName);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network response was not ok");
    const blobData = await response.blob();
    const objectUrl = URL.createObjectURL(blobData);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error("File download failed:", error);
    // Fallback: open in new tab if fetch fails
    window.open(getUploadedFileUrl(storedName), "_blank");
  }
}

function printUploadedFile(storedName: string, mimeType: string, originalName: string) {
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (!isImage && !isPdf) {
    // For Word/Excel/etc, we can't render for printing in browser.
    // Just open it directly so the user can print from their local app.
    window.open(getUploadedFileUrl(storedName), "_blank");
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=900");
  if (!printWindow) {
    alert("Please allow pop-ups to print this file.");
    return;
  }

  const fileUrl = getUploadedFileUrl(storedName);
  const safeName = originalName.replace(/[<>"']/g, "");
  printWindow.document.write(`<!doctype html><html><head><title>Print ${safeName}</title><style>html,body{margin:0;background:#fff}body{display:flex;align-items:center;justify-content:center;min-height:100vh}img,iframe{border:0;max-width:100vw;max-height:100vh;width:100vw;height:100vh;object-fit:contain}</style></head><body>${isImage ? `<img src="${fileUrl}" alt="${safeName}" onload="window.print()" />` : `<iframe src="${fileUrl}" title="${safeName}" onload="window.print()"></iframe>`}</body></html>`);
  printWindow.document.close();
}

export interface Order {
  id: string;
  customer: string;
  service: "document" | "passport";
  color: "bw" | "color";
  paper: string;
  copies: number;
  sides: string;

  files: number;
  uploadedFiles: UploadedFile[];

  estimatedAmount: number;
  finalAmount?: number;

  status: OrderStatus;
  cancelReason?: string;

  time: string;
  notes: string;
}

export interface LinkedLedgerOrder {
  id: string;
  customer?: string | null;
  phone?: string | null;
  service?: string | null;
  color?: string | null;
  paper?: string | null;
  copies?: number | null;
  sides?: string | null;
  estimatedAmount?: number | null;
  finalAmount?: number | null;
  status?: string | null;
  createdAt?: string | null;
}

export interface LedgerEntry {
  id: string;
  customer: string;
  phone?: string;
  orderId?: string;
  order?: LinkedLedgerOrder | null;
  totalAmount: number;
  amountPaid: number;
  status: "due" | "partial" | "settled";
  createdAt: string;
  dueDate?: string;
  note?: string;
  paymentHistory: { amount: number; date: string }[];
}

export interface PrinterEntry {
  id: string;
  displayName: string;
  model: string;
  connection: string;
  defaultPaper: string;
  isDefault: boolean;

  portName?: string;
  status?: string;
  hostAddress?: string | null;
  protocol?: string | null;
  portNumber?: string | null;
  shared?: boolean;
  computerName?: string | null;
  published?: boolean;
}

// All orders, ledger entries, and reports are loaded from the backend.

const DEFAULT_PRICES = {
  a4_bw_single: 3,
  a4_bw_double: 4,
  a4_color_single: 10,
  a4_color_double: 18,
  a3_bw_single: 3,
  a3_bw_double: 4,
  a3_color_single: 10,
  a3_color_double: 18,
  passport_5: 60,
  passport_8: 90,
};

const SHOP_SETTINGS = {
  name: "Inkory",
  whatsapp: "+91 84948 92213",
  whatsappLink: "918494892213",
  email: "moosa.sstore.24@gmail.com",
  address: "", // intentionally blank — do not invent an address
  customerPortalUrl: "https://moosastore.example.com", // update once deployed
};

// ─── adminApi — connected to real backend ────────────────────────────

const adminApi = {
  async login(
    username: string,
    password: string,
  ): Promise<{ ok: boolean; token?: string; error?: string }> {
    try {
      const response = await fetch("http://localhost:5000/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          ok: false,
          error: data.message || "Incorrect username or password.",
        };
      }

      return {
        ok: true,
        token: data.token,
      };
    } catch (error) {
      console.error("Admin login error:", error);

      return {
        ok: false,
        error:
          "Cannot connect to the server. Make sure the backend is running.",
      };
    }
  },

  getPrinters: async (): Promise<PrinterEntry[]> => {
    const token = sessionStorage_safe_get();

    if (!token) {
      throw new Error("Admin session expired. Please sign in again.");
    }

    const response = await fetch("http://localhost:5000/api/admin/printers", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      if (response.status === 401) {
        throw new Error("Admin session expired. Please sign in again.");
      }

      throw new Error(data.message || "Failed to detect printers.");
    }

    return (data.printers || []).map(
      (printer: any, index: number): PrinterEntry => ({
        id: `PR-${index + 1}-${String(printer.name || "printer")
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 20)}`,
        displayName: String(printer.name || "Unknown Printer"),
        model: String(printer.model || "Unknown Model"),
        connection: String(printer.connection || "Windows"),
        defaultPaper: "A4",
        isDefault: false,
        portName: printer.portName || "",
        status: printer.status || "Unknown",
        hostAddress: printer.hostAddress || null,
        protocol: printer.protocol || null,
        portNumber: printer.portNumber || null,
        shared: Boolean(printer.shared),
        computerName: printer.computerName || null,
        published: Boolean(printer.published),
      }),
    );
  },

  getOrders: async (): Promise<Order[]> => {
    const response = await fetch("http://localhost:5000/api/orders");

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to load orders.");
    }

    return data.orders.map((o: any): Order => ({
      id: o.id,
      customer: o.customer,
      service: o.service,
      color: o.color,
      paper: o.paper,
      copies: o.copies,
      sides: o.sides,
      files: o.files,
      uploadedFiles: (o.uploadedFiles || []).map((f: any): UploadedFile => ({
        id: Number(f.id),
        orderId: String(f.orderId),
        originalName: String(f.originalName),
        storedName: String(f.storedName),
        mimeType: String(f.mimeType),
        size: Number(f.size),
        pages: f.pages == null ? undefined : Number(f.pages),
        copies: f.copies == null ? 1 : Number(f.copies),
        createdAt: String(f.createdAt),
      })),
      estimatedAmount: Number(o.estimatedAmount),
      finalAmount: o.finalAmount !== null ? Number(o.finalAmount) : undefined,
      status: o.status,
      cancelReason: o.cancelReason ?? undefined,
      notes: o.notes ?? "",
      time: new Date(o.createdAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));
  },

  updateOrder: async (id: string, updates: Partial<Order>): Promise<Order> => {
    const response = await fetch(
      `http://localhost:5000/api/orders/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      },
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to update order.");
    }

    const o = data.order;

    return {
      id: o.id,
      customer: o.customer,
      service: o.service,
      color: o.color,
      paper: o.paper,
      copies: o.copies,
      sides: o.sides,
      files: o.files,
      uploadedFiles: (o.uploadedFiles || []).map((f: any): UploadedFile => ({
        id: Number(f.id),
        orderId: String(f.orderId),
        originalName: String(f.originalName),
        storedName: String(f.storedName),
        mimeType: String(f.mimeType),
        size: Number(f.size),
        pages: f.pages == null ? undefined : Number(f.pages),
        copies: f.copies == null ? 1 : Number(f.copies),
        createdAt: String(f.createdAt),
      })),
      estimatedAmount: Number(o.estimatedAmount),
      finalAmount: o.finalAmount !== null ? Number(o.finalAmount) : undefined,
      status: o.status,
      cancelReason: o.cancelReason ?? undefined,
      notes: o.notes ?? "",
      time: new Date(o.createdAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  },

  deleteOrders: async (ids: string[]): Promise<boolean> => {
    const response = await fetch("http://localhost:5000/api/orders", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to delete orders.");
    }
    return true;
  },

  addOrderDebt: async (
    orderId: string,
    amountPaid: number = 0,
    notes?: string,
  ): Promise<LedgerEntry> => {
    const token = sessionStorage_safe_get();
    if (!token) throw new Error("Admin session expired. Please sign in again.");

    const response = await fetch(
      `http://localhost:5000/api/orders/${encodeURIComponent(orderId)}/debt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amountPaid, notes }),
      },
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to add order to debt.");
    }

    const entry = data.entry;

    return {
      id: String(entry.id),
      customer: String(entry.customer || ""),
      phone: entry.phone || undefined,
      orderId: entry.orderId || undefined,
      totalAmount: Number(entry.totalAmount || 0),
      amountPaid: Number(entry.amountPaid || 0),
      status: entry.status,
      createdAt: new Date(entry.createdAt).toLocaleDateString("en-IN"),
      note: entry.notes || undefined,
      paymentHistory: (entry.payments || []).map((payment: any) => ({
        amount: Number(payment.amount || 0),
        date: new Date(payment.createdAt).toLocaleDateString("en-IN"),
      })),
    };
  },

  createWalkInDebt: async (payload: {
    customer: string;
    phone?: string;
    totalAmount: number;
    amountPaid?: number;
    notes?: string;
  }): Promise<LedgerEntry> => {
    const token = sessionStorage_safe_get();
    if (!token) throw new Error("Admin session expired. Please sign in again.");

    const response = await fetch("http://localhost:5000/api/ledger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to create debt entry.");
    }

    const entry = data.entry;

    return {
      id: String(entry.id),
      customer: String(entry.customer || ""),
      phone: entry.phone || undefined,
      orderId: entry.orderId || undefined,
      totalAmount: Number(entry.totalAmount || 0),
      amountPaid: Number(entry.amountPaid || 0),
      status: entry.status,
      createdAt: new Date(entry.createdAt).toLocaleDateString("en-IN"),
      note: entry.notes || undefined,
      paymentHistory: (entry.payments || []).map((payment: any) => ({
        amount: Number(payment.amount || 0),
        date: new Date(payment.createdAt).toLocaleDateString("en-IN"),
      })),
    };
  },

  getLedger: async (): Promise<LedgerEntry[]> => {
    const token = sessionStorage_safe_get();

    if (!token) {
      throw new Error("Admin session expired. Please sign in again.");
    }

    const response = await fetch("http://localhost:5000/api/ledger", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      if (response.status === 401) {
        throw new Error("Admin session expired. Please sign in again.");
      }

      throw new Error(data.message || "Failed to load ledger.");
    }

    return (data.entries || []).map((entry: any): LedgerEntry => ({
      id: String(entry.id),
      customer: String(
        entry.customer || entry.order?.customer || "",
      ),
      phone:
        entry.phone || entry.order?.phone || undefined,
      orderId:
        entry.orderId || entry.order?.id || undefined,
      order: entry.order
        ? {
            id: String(entry.order.id),
            customer: entry.order.customer ?? null,
            phone: entry.order.phone ?? null,
            service: entry.order.service ?? null,
            color: entry.order.color ?? null,
            paper: entry.order.paper ?? null,
            copies: entry.order.copies ?? null,
            sides: entry.order.sides ?? null,
            estimatedAmount: entry.order.estimatedAmount ?? null,
            finalAmount: entry.order.finalAmount ?? null,
            status: entry.order.status ?? null,
            createdAt: entry.order.createdAt ?? null,
          }
        : null,
      totalAmount: Number(entry.totalAmount || 0),
      amountPaid: Number(entry.amountPaid || 0),
      status: entry.status,
      createdAt: new Date(entry.createdAt).toLocaleDateString("en-IN"),
      note: entry.notes || undefined,

      paymentHistory: (entry.payments || []).map((payment: any) => ({
        amount: Number(payment.amount || 0),
        date: new Date(payment.createdAt).toLocaleDateString("en-IN"),
      })),
    }));
  },
};
// ─── Auth/session (frontend shape only — real session must be server-verified) ──

function useAdminSession() {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage_safe_get(),
  );
  const login = (t: string) => {
    setToken(t);
    sessionStorage_safe_set(t);
  };
  const logout = () => {
    setToken(null);
    sessionStorage_safe_clear();
  };
  return { isAuthed: !!token, login, logout };
}
// NOTE: sessionStorage works in a real deployed app; if this ever runs inside the
// Claude.ai artifact preview, browser storage is disabled there — this module
// degrades to in-memory only in that environment, which is fine for previewing.
let _memToken: string | null = null;
function sessionStorage_safe_get() {
  try {
    return sessionStorage.getItem("pf_admin_token") ?? _memToken;
  } catch {
    return _memToken;
  }
}
function sessionStorage_safe_set(t: string) {
  _memToken = t;
  try {
    sessionStorage.setItem("pf_admin_token", t);
  } catch {}
}
function sessionStorage_safe_clear() {
  _memToken = null;
  try {
    sessionStorage.removeItem("pf_admin_token");
  } catch {}
}

// ─── Sidebar ──────────────────────────────────────────────────────────

function Sidebar({
  screen,
  setScreen,
  onLogout,
  pendingCount,
  collapsed,
  setCollapsed,
}: {
  screen: AScreen;
  setScreen: (s: AScreen) => void;
  onLogout: () => void;
  pendingCount: number;
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const nav: Array<{
    id: AScreen;
    icon: React.ReactNode;
    label: string;
    badge?: number;
  }> = [
    {
      id: "dashboard",
      icon: <LayoutDashboard size={18} />,
      label: "Dashboard",
    },
    {
      id: "orders",
      icon: <List size={18} />,
      label: "Orders",
      badge: pendingCount,
    },
    { id: "queue", icon: <PrinterIcon size={18} />, label: "Print Queue" },
    { id: "reports", icon: <BarChart2 size={18} />, label: "Reports" },
    { id: "storage", icon: <HardDrive size={18} />, label: "Storage" },
    { id: "settings", icon: <Settings size={18} />, label: "Settings" },
  ];

  const width = collapsed ? 64 : 220;

  return (
    <div
      className="glass"
      style={{
        width,
        minWidth: width,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        borderRight: "1px solid rgba(255,255,255,0.07)",
        padding: collapsed ? "16px 8px" : "20px 10px",
        boxSizing: "border-box",
        transition:
          "width 0.22s ease, min-width 0.22s ease, padding 0.22s ease",
        zIndex: 10,
        overflow: "hidden",
      }}
    >
      {/* Printer Logo / Brand Header — Click logo to toggle small/full sidebar */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        title={
          collapsed
            ? "Click logo to expand sidebar"
            : "Click logo to collapse sidebar"
        }
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 10,
          padding: collapsed ? "6px 0" : "6px 8px",
          marginBottom: 20,
          flexShrink: 0,
          cursor: "pointer",
          borderRadius: T.r.md,
          transition: "background 0.18s ease",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "rgba(255,255,255,0.06)")
        }
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${G.accent}, ${G.deep})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 20px ${G.glow}`,
            flexShrink: 0,
            transition: "transform 0.18s ease",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.transform = "scale(1.08)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <Printer size={18} color="#fff" strokeWidth={2} />
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
             Inkory
            </div>
            <div
              style={{
                fontSize: 10,
                color: T.text.muted,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              Inkory Admin
            </div>
          </div>
        )}
      </div>

      {/* Small Icon Navigation items */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => setScreen(item.id)}
            title={collapsed ? item.label : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: 10,
              padding: collapsed ? "10px 0" : "9px 10px",
              borderRadius: T.r.md,
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              background: screen === item.id ? G.a14 : "transparent",
              color: screen === item.id ? G.accent : T.text.secondary,
              fontSize: 13,
              fontWeight: screen === item.id ? 600 : 400,
              fontFamily: "inherit",
              width: "100%",
              flexShrink: 0,
              transition: "all 0.18s",
              boxShadow:
                screen === item.id ? `inset 0 0 0 1px ${G.border}` : "none",
              position: "relative",
            }}
            onMouseEnter={(e) => {
              if (screen !== item.id)
                (e.currentTarget as HTMLElement).style.background =
                  "rgba(255,255,255,0.05)";
            }}
            onMouseLeave={(e) => {
              if (screen !== item.id)
                (e.currentTarget as HTMLElement).style.background =
                  "transparent";
            }}
          >
            {item.icon}
            {!collapsed && item.label}
            {!!item.badge &&
              item.badge > 0 &&
              (collapsed ? (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 6,
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: O.primary,
                  }}
                />
              ) : (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 10,
                    fontWeight: 700,
                    background: O.a14,
                    color: O.accent,
                    border: `1px solid ${O.border}`,
                    borderRadius: T.r.pill,
                    padding: "1px 7px",
                    flexShrink: 0,
                  }}
                >
                  {item.badge}
                </span>
              ))}
          </button>
        ))}
      </div>

      {/* User Section */}
      <div style={{ flexShrink: 0 }}>
        <Divider style={{ marginBottom: 12 }} />
        {!collapsed ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 10px",
            }}
          >
            <Avatar name="Admin Owner" size={32} theme="green" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Admin
              </div>
              <div style={{ fontSize: 10, color: T.text.muted }}>Owner</div>
            </div>
            <button
              onClick={onLogout}
              title="Log out"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: T.text.muted,
                display: "flex",
                padding: 4,
                borderRadius: 6,
                flexShrink: 0,
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Avatar name="Admin Owner" size={28} theme="green" />
            <button
              onClick={onLogout}
              title="Log out"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: T.text.muted,
                display: "flex",
                padding: 4,
                borderRadius: 6,
              }}
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Top bar (search + notifications now functional) ──────────────────

function Topbar({
  title,
  subtitle,
  orders,
  onOpenOrder,
}: {
  title: string;
  subtitle?: string;
  orders: Order[];
  onOpenOrder: (o: Order) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return orders
      .filter(
        (o) =>
          o.customer.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [query, orders]);

  

  return (
    <div
      style={{
        padding: "18px 28px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(7,7,17,0.70)",
        backdropFilter: "blur(24px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        gap: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 750, letterSpacing: "-0.03em" }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 12, color: T.text.muted, marginTop: 1 }}>
            {subtitle}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, position: "relative" }}>
        

        {/* Search */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => {
              setSearchOpen((v) => !v);
            }}
            style={{
              width: 36,
              height: 36,
              borderRadius: T.r.md,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.09)",
              cursor: "pointer",
              color: T.text.secondary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Search size={16} />
          </button>
          {searchOpen && (
            <div
              style={{
                position: "absolute",
                top: 44,
                right: 0,
                width: 300,
                background: "rgba(10,14,10,0.97)",
                border: `1px solid ${G.border}`,
                borderRadius: T.r.md,
                boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                zIndex: 100,
                overflow: "hidden",
              }}
            >
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Order ID or customer name…"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "12px 14px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  color: T.text.primary,
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              {results.map((o) => (
                <div
                  key={o.id}
                  onClick={() => {
                    onOpenOrder(o);
                    setSearchOpen(false);
                    setQuery("");
                  }}
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    cursor: "pointer",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{o.customer}</span>
                  <span
                    className="mono"
                    style={{ color: T.text.muted, fontSize: 11 }}
                  >
                    {o.id}
                  </span>
                </div>
              ))}
              {query && results.length === 0 && (
                <div
                  style={{
                    padding: "14px",
                    fontSize: 12,
                    color: T.text.muted,
                    textAlign: "center",
                  }}
                >
                  No matches
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Login (real validation shape; still needs a real backend endpoint) ──
// ─── Login ───────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const submit = async () => {
    if (loading) return;

    if (!username.trim() || !pass) {
      setErr("Enter both username and password.");
      return;
    }

    setLoading(true);
    setErr(null);

    const res = await adminApi.login(username, pass);

    setLoading(false);

    if (res.ok && res.token) {
      onLogin(res.token);
    } else {
      setErr(res.error ?? "Login failed.");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState("CapsLock"));

    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <AdminBg />

      <div
        className="penter"
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 420,
        }}
      >
        {/* Header */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 28,
          }}
        >
          <div
            style={{
              position: "relative",
              width: 80,
              height: 80,
              margin: "0 auto 18px",
            }}
          >
            {[0, 1].map((i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: `1px solid ${G.border}`,
                  animation: `ring-expand 2.4s ease-out ${i * 1.2}s infinite`,
                }}
              />
            ))}

            <div
              style={{
                position: "absolute",
                inset: 10,
                background: `linear-gradient(135deg, ${G.accent}, ${G.primary}, ${G.deep})`,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 40px ${G.glow}`,
              }}
            >
              <Printer size={28} color="#fff" strokeWidth={1.8} />
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: G.accent,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 7,
            }}
          >
            Inkory
          </div>

          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              margin: "0 0 7px",
            }}
          >
            Admin Login
          </h1>

          <p
            style={{
              fontSize: 13,
              color: T.text.secondary,
              margin: 0,
            }}
          >
            Sign in to manage your store
          </p>
        </div>

        {/* Login Card */}
        <Card
          accent="green"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <Input
            label="Username"
            value={username}
            onChange={setUsername}
            placeholder="Enter username"
            theme="green"
            autoFocus
            disabled={loading}
            onKeyDown={onKeyDown}
          />

          <div>
            <Input
              label="Password"
              value={pass}
              onChange={setPass}
              placeholder="Enter password"
              type={showPassword ? "text" : "password"}
              theme="green"
              disabled={loading}
              onKeyDown={onKeyDown}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    width: 32,
                    height: 32,
                    border: "none",
                    background: "transparent",
                    color: T.text.muted,
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: T.r.sm,
                  }}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              }
            />

            {capsLock && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  marginTop: 8,
                  padding: "7px 10px",
                  borderRadius: T.r.md,
                  background: "rgba(251,191,36,0.08)",
                  border: "1px solid rgba(251,191,36,0.18)",
                  color: "#fbbf24",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: 13 }}>⇧</span>
                <span>Caps Lock is ON</span>
              </div>
            )}
          </div>

          {err && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "10px 14px",
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.22)",
                borderRadius: T.r.md,
              }}
            >
              <AlertCircle size={14} color="#fca5a5" />

              <span
                style={{
                  fontSize: 13,
                  color: "#fca5a5",
                }}
              >
                {err}
              </span>
            </div>
          )}

          <Btn
            onClick={submit}
            theme="green"
            full
            size="lg"
            loading={loading}
            icon={<LogIn size={17} />}
          >
            {loading ? "Signing in…" : "Sign In"}
          </Btn>

          <div
            style={{
              textAlign: "center",
              fontSize: 10,
              color: T.text.muted,
              opacity: 0.7,
            }}
          >
            Press Enter to sign in
          </div>
        </Card>

        <p
          style={{
            textAlign: "center",
            fontSize: 11,
            color: T.text.muted,
            marginTop: 16,
          }}
        >
          Inkory · Admin access only
        </p>
      </div>
    </div>
  );
}
// ─── Dashboard (simplified, real-date, real-derived stats) ────────────

function DashboardScreen({
  orders,
  setScreen,
  setSelectedOrder,
}: {
  orders: Order[];
  setScreen: (s: AScreen) => void;
  setSelectedOrder: (o: Order) => void;
}) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const counts = useMemo(
    () => ({
      total: orders.length,
      pendingReview: orders.filter(
        (o) => o.status === "received" || o.status === "reviewing",
      ).length,
      printing: orders.filter((o) => o.status === "printing").length,
      ready: orders.filter((o) => o.status === "ready").length,
      completed: orders.filter((o) => o.status === "completed").length,
      revenue: orders
        .filter((o) => o.status === "completed")
        .reduce((s, o) => s + (o.finalAmount ?? o.estimatedAmount), 0),
    }),
    [orders],
  );

  const stats = [
      {
      label: "Orders",
      value: String(counts.total),
      icon: <Package size={18} />,
      color: "green" as const,
    },
    {
      label: "Pending Review",
      value: String(counts.pendingReview),
      icon: <Clock size={18} />,
      color: "orange" as const,
    },
    {
      label: "Printing",
      value: String(counts.printing),
      icon: <Printer size={18} />,
      color: "blue" as const,
    },
    {
      label: "Ready for Pickup",
      value: String(counts.ready),
      icon: <CheckCircle2 size={18} />,
      color: "green" as const,
    },
    {
      label: "Completed",
      value: String(counts.completed),
      icon: <CheckCircle2 size={18} />,
      color: "green" as const,
    },
    {
      label: "Completed Value",
      value: `₹${counts.revenue}`,
      icon: <TrendingUp size={18} />,
      color: "green" as const,
    },
  ];

  const activeOrders = orders.filter(
    (o) => !["completed", "cancelled"].includes(o.status),
  );

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <Topbar
        title="Dashboard"
        subtitle={dateStr}
        orders={orders}
        onOpenOrder={(o) => {
          setSelectedOrder(o);
          setScreen("order-detail");
        }}
      />
      <div style={{ padding: "24px 28px", position: "relative", zIndex: 1 }}>
        <div
          className="penter"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            marginBottom: 24,
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: T.r.lg,
            overflow: "hidden",
            background: "rgba(255,255,255,0.025)",
          }}
        >
          {stats.map((s, i) => (
            <div
              key={i}
              style={{
                minWidth: 0,
                padding: "15px 16px",
                borderRight: i < stats.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: s.color === "orange" ? O.accent : s.color === "blue" ? "#8ab4ff" : G.accent, marginBottom: 9 }}>
                {s.icon}
                <span style={{ fontSize: 10, color: T.text.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.04em", color: T.text.primary }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="penter d4">
          <Card pad={0}>
            <div
              style={{
                padding: "16px 24px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  Active Orders
                </div>
                <div
                  style={{ fontSize: 12, color: T.text.muted, marginTop: 1 }}
                >
                  {activeOrders.length} need attention
                </div>
              </div>
              <Btn
                onClick={() => setScreen("orders")}
                variant="secondary"
                theme="green"
                size="sm"
                iconRight={<ChevronRight size={13} />}
              >
                All Orders
              </Btn>
            </div>
            {activeOrders.length === 0 ? (
              <div
                style={{
                  padding: "40px 24px",
                  textAlign: "center",
                  color: T.text.muted,
                  fontSize: 13,
                }}
              >
                No active orders right now.
              </div>
            ) : (
              activeOrders.slice(0, 6).map((order, i, arr) => (
                <div
                  key={order.id}
                  onClick={() => {
                    setSelectedOrder(order);
                    setScreen("order-detail");
                  }}
                  style={{
                    padding: "13px 24px",
                    borderBottom:
                      i < arr.length - 1
                        ? "1px solid rgba(255,255,255,0.04)"
                        : "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "rgba(255,255,255,0.025)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "transparent")
                  }
                >
                  <Avatar name={order.customer} size={36} theme="green" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {order.customer}
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 11,
                        color: T.text.muted,
                        marginTop: 1,
                      }}
                    >
                      {order.id} · {order.time}
                    </div>
                  </div>
                  <StatusBadge status={order.status} />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: G.accent,
                      minWidth: 48,
                      textAlign: "right",
                    }}
                  >
                    ₹{order.finalAmount ?? order.estimatedAmount}
                  </span>
                  <ChevronRight size={14} color={T.text.muted} />
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Orders ───────────────────────────────────────────────────────────

const STATUS_FILTERS: Array<{ id: "all" | OrderStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "received", label: "Received" },
  { id: "reviewing", label: "Reviewing" },
  { id: "printing", label: "Printing" },
  { id: "ready", label: "Ready" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

function OrdersScreen({
  orders,
  setScreen,
  setSelectedOrder,
  onOrdersDeleted,
}: {
  orders: Order[];
  setScreen: (s: AScreen) => void;
  setSelectedOrder: (o: Order) => void;
  onOrdersDeleted: (updatedOrders: Order[]) => void;
}) {
  const [category, setCategory] = useState<"all" | "document" | "passport">("all");
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = orders
    .filter((o) => category === "all" || o.service === category)
    .filter((o) => filter === "all" || o.status === filter)
    .filter(
      (o) =>
        !search ||
        o.customer.toLowerCase().includes(search.toLowerCase()) ||
        o.id.toLowerCase().includes(search.toLowerCase()),
    );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }
  void toggleSelect;

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((o) => o.id)));
    }
  }
  void toggleSelectAll;

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const confirmMsg = `Are you sure you want to delete ${selectedIds.size} selected order(s)? This will also permanently delete their files from the device.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await adminApi.deleteOrders(Array.from(selectedIds));
      const updatedOrders = await adminApi.getOrders();
      onOrdersDeleted(updatedOrders);
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      alert("Failed to delete selected orders.");
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <Topbar
        title="Orders"
        subtitle={`${orders.length} orders today`}
        orders={orders}
        onOpenOrder={(o) => {
          setSelectedOrder(o);
          setScreen("order-detail");
        }}
      />
      <div style={{ padding: "24px 28px", position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: T.text.muted,
              }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or order ID…"
              style={{
                width: "100%",
                height: 38,
                boxSizing: "border-box",
                paddingLeft: 36,
                paddingRight: 14,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: T.r.md,
                color: T.text.primary,
                fontSize: 13,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>


          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: T.r.md,
                  fontSize: 12,
                  fontWeight: 500,
                  background:
                    filter === f.id ? G.a14 : "rgba(255,255,255,0.04)",
                  border: `1px solid ${filter === f.id ? G.border : "rgba(255,255,255,0.08)"}`,
                  color: filter === f.id ? G.accent : T.text.secondary,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  fontFamily: "inherit",
                }}
              >
                {f.label}
              </button>
            ))}
            {selectedIds.size > 0 && (
              <Btn
                onClick={handleDeleteSelected}
                variant="danger"
                theme="orange"
                size="sm"
                icon={<Trash2 size={14} />}
              >
                Delete Selected ({selectedIds.size})
              </Btn>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 14 }}>
          <div style={{ display: "inline-flex", padding: 3, gap: 3, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: T.r.md }}>
            {([ ["all", "All"], ["document", "Documents"], ["passport", "Passport"] ] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => { setCategory(id); setSelectedIds(new Set()); setFilter("all"); }} style={{ minWidth: 118, padding: "8px 18px", borderRadius: T.r.md, border: "1px solid transparent", background: category === id ? G.a14 : "transparent", color: category === id ? G.accent : T.text.muted, fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{label}</button>
            ))}
          </div>
        </div>

        <Card pad={0}>
          <Table<Order>
            rows={filtered}
            onRow={(o) => {
              setSelectedOrder(o);
              setScreen("order-detail");
            }}
            emptyState={
              <div style={{ textAlign: "center", color: T.text.muted }}>
                <List
                  size={32}
                  style={{ margin: "0 auto 10px", opacity: 0.3 }}
                />
                <div style={{ fontSize: 14 }}>No orders match this filter</div>
              </div>
            }
            cols={[
              {
                key: "select",
                label: (
                  <input
                    type="checkbox"
                    className={`custom-checkbox ${selectedIds.size > 0 && selectedIds.size === filtered.length ? "is-selected" : ""}`}
                    checked={
                      filtered.length > 0 &&
                      selectedIds.size === filtered.length
                    }
                    onChange={toggleSelectAll}
                  />
                ),
                width: "40px",
                align: "center" as const,
                render: (o) => (
                  <input
                    type="checkbox"
                    className={`custom-checkbox ${selectedIds.has(o.id) ? "is-selected" : ""}`}
                    checked={selectedIds.has(o.id)}
                    onChange={() => toggleSelect(o.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ),
              },
              {
                key: "id",
                label: "Order ID",
                width: "160px",
                render: (o) => (
                  <span
                    className="mono"
                    style={{ fontSize: 12, fontWeight: 600, color: G.accent }}
                  >
                    {o.id}
                  </span>
                ),
              },
              {
                key: "customer",
                label: "Customer",
                render: (o) => (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <Avatar name={o.customer} size={30} theme="green" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {o.customer}
                      </div>
                      <div style={{ fontSize: 11, color: T.text.muted }}>
                        {o.time}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: "service",
                label: "Service",
                width: "90px",
                render: (o) => (
                  <Badge
                    label={o.service === "passport" ? "Passport" : "Document"}
                    color={o.service === "passport" ? "purple" : "blue"}
                  />
                ),
              },
              {
                key: "color",
                label: "Details",
                width: "110px",
                render: (o) => (
                  <span style={{ fontSize: 12, color: T.text.secondary }}>
                    {o.color === "color" ? "Color" : "B&W"} · {o.paper}
                  </span>
                ),
              },
              {
                key: "copies",
                label: "Copies",
                width: "60px",
                align: "center" as const,
                render: (o) => (
                  <span style={{ fontSize: 13 }}>×{o.copies}</span>
                ),
              },
              {
                key: "amount",
                label: "Amount",
                width: "80px",
                align: "right" as const,
                render: (o) => (
                  <span
                    style={{ fontSize: 14, fontWeight: 700, color: G.accent }}
                  >
                    ₹{o.finalAmount ?? o.estimatedAmount}
                  </span>
                ),
              },
              {
                key: "status",
                label: "Status",
                width: "130px",
                render: (o) => <StatusBadge status={o.status} />,
              },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

// ─── Order Detail ─────────────────────────────────────────────────────

const FLOW: OrderStatus[] = [
  "received",
  "reviewing",
  "printing",
  "ready",
  "completed",
];
const CANCEL_REASONS = [
  "Customer Cancelled",
  "Invalid File",
  "Duplicate Order",
  "Other",
];

function OrderDetailScreen({
  order,
  onBack,
  onUpdate,
  onPreviewFile,
  onOpenFileEditor,
}: {
  order: Order;
  onBack: () => void;
  onUpdate: (o: Order) => void;
  onPreviewFile: (
    url: string,
    mimeType: string,
    originalName: string,
    isBw: boolean,
  ) => void;
  onOpenFileEditor: (file: UploadedFile) => void;
}) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [finalAmt, setFinalAmt] = useState(String(order.finalAmount ?? ""));
  const [notes, setNotes] = useState(order.notes);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [manualStatusOpen, setManualStatusOpen] = useState(false);
  const [completionPaymentOpen, setCompletionPaymentOpen] = useState(false);
  const [orderDebtPaid, setOrderDebtPaid] = useState("0");
  const [orderDebtNote, setOrderDebtNote] = useState("");

  const idx = FLOW.indexOf(status);
  const cancelled = status === "cancelled";

  const persist = async (next: Partial<Order>) => {
    try {
      const updates: Partial<Order> = {
        status,
        finalAmount: finalAmt ? Number(finalAmt) : order.finalAmount,
        notes,
        ...next,
      };

      const updated = await adminApi.updateOrder(order.id, updates);
      onUpdate(updated);
      return updated;
    } catch (error) {
      console.error("Failed to update order:", error);
      alert("Could not save the order change. Please try again.");
      return null;
    }
  };

  const advance = async () => {
    if (cancelled || idx >= FLOW.length - 1) return;
    const next = FLOW[idx + 1];
    setStatus(next);
    const updated = await persist({ status: next });
    if (updated && next === "ready") {
      setOrderDebtPaid("0");
      setOrderDebtNote("");
      setCompletionPaymentOpen(true);
    }
  };

  const changeStatusManually = async (s: OrderStatus) => {
    setStatus(s);
    const updated = await persist({ status: s });
    setManualStatusOpen(false);
    if (updated && s === "ready") {
      setOrderDebtPaid("0");
      setOrderDebtNote("");
      setCompletionPaymentOpen(true);
    }
  };

  const addOrderToDebt = async () => {
    const total = Number(finalAmt || order.finalAmount || order.estimatedAmount);
    const paid = Number(orderDebtPaid || 0);

    if (!Number.isFinite(total) || total <= 0) {
      alert("Please enter a valid final amount before recording payment.");
      return;
    }

    if (!Number.isFinite(paid) || paid < 0 || paid > total) {
      alert("Paid amount must be between ₹0 and the bill amount.");
      return;
    }

    try {
      await adminApi.addOrderDebt(order.id, paid, orderDebtNote);
      setCompletionPaymentOpen(false);
      setOrderDebtPaid("0");
      setOrderDebtNote("");
      alert(paid >= total ? "Payment recorded." : "Order added to debt.");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to record order payment.");
    }
  };

  const confirmCancel = () => {
    setStatus("cancelled");
    persist({ status: "cancelled", cancelReason });
    setCancelModal(false);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div
        style={{
          padding: "18px 28px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: "rgba(7,7,17,0.70)",
          backdropFilter: "blur(24px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <button
          onClick={onBack}
          style={{
            width: 36,
            height: 36,
            borderRadius: T.r.md,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.09)",
            cursor: "pointer",
            color: T.text.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ArrowLeft size={17} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              className="mono"
              style={{ fontSize: 16, fontWeight: 700, color: G.accent }}
            >
              {order.id}
            </span>
            <StatusBadge status={status} />
          </div>
          <p style={{ fontSize: 12, color: T.text.muted, marginTop: 1 }}>
            {order.customer} · {order.time}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, position: "relative" }}>
          <Btn
            onClick={advance}
            theme="green"
            size="sm"
            disabled={cancelled || status === "completed"}
            icon={<Play size={14} />}
          >
            {status === "completed" ? "Completed" : "Advance to Next Step"}
          </Btn>
          <Btn
            onClick={() => setManualStatusOpen((v) => !v)}
            theme="green"
            variant="secondary"
            size="sm"
          >
            Change Status
          </Btn>
          {manualStatusOpen && (
            <div
              style={{
                position: "absolute",
                top: 44,
                right: 96,
                width: 180,
                background: "rgba(10,14,10,0.97)",
                border: `1px solid ${G.border}`,
                borderRadius: T.r.md,
                zIndex: 100,
                overflow: "hidden",
              }}
            >
              {FLOW.map((s) => (
                <div
                  key={s}
                  onClick={() => changeStatusManually(s)}
                  style={{
                    padding: "9px 14px",
                    fontSize: 12,
                    cursor: "pointer",
                    color: s === status ? G.accent : T.text.secondary,
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </div>
              ))}
            </div>
          )}
          {!cancelled && (
            <button
              onClick={() => setCancelModal(true)}
              title="Cancel order"
              style={{
                width: 36,
                height: 36,
                borderRadius: T.r.md,
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.22)",
                cursor: "pointer",
                color: "#fca5a5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ban size={16} />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: "24px 28px", position: "relative", zIndex: 1 }}>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card accent="green">
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.text.muted,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                Customer
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={order.customer} size={52} theme="green" />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {order.customer}
                  </div>
                </div>
              </div>
              {cancelled && order.cancelReason && (
                <div
                  style={{
                    marginTop: 14,
                    padding: "10px 14px",
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: T.r.md,
                    fontSize: 13,
                    color: "#fca5a5",
                  }}
                >
                  Cancelled — {order.cancelReason}
                </div>
              )}
            </Card>

            <Card>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.text.muted,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 16,
                }}
              >
                {order.service === "passport"
                  ? "Passport Photo Details"
                  : "Print Settings"}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                {(order.service === "passport"
                  ? [
                      {
                        k: "Package",
                        v: order.copies >= 8 ? "8 Photos" : "5 Photos",
                      },
                      {
                        k: "Price",
                        v: `₹${
                          order.copies >= 8
                            ? DEFAULT_PRICES.passport_8
                            : DEFAULT_PRICES.passport_5
                        }`,
                      },
                      {
                        k: "Orientation",
                        v:
                          order.sides === "landscape"
                            ? "Landscape"
                            : "Portrait",
                      },
                      {
                        k: "Sheet",
                        v: "A4",
                      },
                    ]
                  : [
                      {
                        k: "Color Mode",
                        v:
                          order.color === "color"
                            ? "Full Color"
                            : "Black & White",
                      },
                      {
                        k: "Paper Size",
                        v: order.paper,
                      },
                      {
                        k: "Copies",
                        v: `${order.copies}×`,
                      },
                      {
                        k: "Sides",
                        v: order.sides,
                      },
                      {
                        k: "Files",
                        v: `${order.files} file${order.files > 1 ? "s" : ""}`,
                      },
                    ]
                ).map(({ k, v }) => (
                  <div
                    key={k}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: T.r.md,
                      padding: "12px 14px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: T.text.muted,
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      {k}
                    </div>

                    <div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.text.muted,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                {order.service === "passport"
                  ? "Uploaded Photo"
                  : "Uploaded Files"}
              </div>
              {order.uploadedFiles && order.uploadedFiles.length > 0
                ? order.uploadedFiles.map((file, i) => (
                    <div
                      key={file.id || i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 0",
                        borderBottom:
                          i < order.uploadedFiles.length - 1
                            ? "1px solid rgba(255,255,255,0.05)"
                            : "none",
                      }}
                    >
                      <IconChip
                        icon={<FileText size={16} />}
                        theme="green"
                        size={36}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={file.originalName}
                        >
                          {file.originalName}
                        </div>
                        <div style={{ fontSize: 11, color: T.text.muted }}>
                          {formatFileSize(file.size)} · {file.mimeType}{file.pages ? ` · ${file.pages} pages` : ''} · {file.copies || 1} {file.copies === 1 ? 'copy' : 'copies'}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() =>
                            onPreviewFile(
                              getUploadedFilePreviewUrl(file.storedName, file.mimeType),
                              file.mimeType,
                              file.originalName,
                              order.color === "bw",
                            )
                          }
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 10px",
                            borderRadius: T.r.md,
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.09)",
                            cursor: "pointer",
                            color: T.text.secondary,
                            fontSize: 11,
                            fontFamily: "inherit",
                          }}
                        >
                          <Eye size={12} /> Preview
                        </button>
                        <button
                          onClick={() => onOpenFileEditor(file)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 10px",
                            borderRadius: T.r.md,
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.09)",
                            cursor: "pointer",
                            color: T.text.secondary,
                            fontSize: 11,
                            fontFamily: "inherit",
                          }}
                        >
                          <Edit3 size={12} /> Editor
                        </button>
                        <button
                          onClick={() => printUploadedFile(file.storedName, file.mimeType, file.originalName)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 10px",
                            borderRadius: T.r.md,
                            background: G.a10,
                            border: `1px solid ${G.border}`,
                            cursor: "pointer",
                            color: G.accent,
                            fontSize: 11,
                            fontFamily: "inherit",
                          }}
                        >
                          <PrinterIcon size={12} /> Print
                        </button>
                        <button
                          onClick={() =>
                            downloadUploadedFile(
                              file.storedName,
                              file.originalName,
                            )
                          }
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 10px",
                            borderRadius: T.r.md,
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.09)",
                            cursor: "pointer",
                            color: T.text.secondary,
                            fontSize: 11,
                            fontFamily: "inherit",
                          }}
                        >
                          <Download size={12} /> Download
                        </button>
                      </div>
                    </div>
                  ))
                : Array.from({ length: order.files }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 0",
                        borderBottom:
                          i < order.files - 1
                            ? "1px solid rgba(255,255,255,0.05)"
                            : "none",
                      }}
                    >
                      <IconChip
                        icon={<FileText size={16} />}
                        theme="green"
                        size={36}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {order.service === "passport"
                            ? `photo_${i + 1}`
                            : `document_${i + 1}`}
                        </div>
                        <div style={{ fontSize: 11, color: T.text.muted }}>
                          Real filename/size shows here once files are
                          backend-linked
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() =>
                            alert(
                              "No uploaded files are available for this order.",
                            )
                          }
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 10px",
                            borderRadius: T.r.md,
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.09)",
                            cursor: "pointer",
                            color: T.text.secondary,
                            fontSize: 11,
                            fontFamily: "inherit",
                          }}
                        >
                          <Eye size={12} /> Preview
                        </button>
                        <button
                          onClick={() =>
                            alert(
                              "No uploaded files are available for this order.",
                            )
                          }
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 10px",
                            borderRadius: T.r.md,
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.09)",
                            cursor: "pointer",
                            color: T.text.secondary,
                            fontSize: 11,
                            fontFamily: "inherit",
                          }}
                        >
                          <Download size={12} /> Download
                        </button>
                      </div>
                    </div>
                  ))}
            </Card>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card accent="green">
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.text.muted,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                Order Progress
              </div>
              {cancelled ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "10px",
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: T.r.md,
                    color: "#fca5a5",
                    fontWeight: 700,
                  }}
                >
                  Cancelled
                </div>
              ) : (
                <>
                  <ProgressBar
                    value={(Math.max(idx, 0) / (FLOW.length - 1)) * 100}
                    theme="green"
                  />
                  <div
                    style={{
                      fontSize: 11,
                      color: T.text.muted,
                      marginTop: 6,
                      marginBottom: 12,
                      textAlign: "right",
                    }}
                  >
                    Step {idx + 1} of {FLOW.length}
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      padding: "10px",
                      background: G.a10,
                      border: `1px solid ${G.border}`,
                      borderRadius: T.r.md,
                    }}
                  >
                    <div
                      style={{ fontSize: 16, fontWeight: 700, color: G.accent }}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </div>
                  </div>
                </>
              )}
            </Card>

            <Card>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.text.muted,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                Order Amount
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <span style={{ fontSize: 13, color: T.text.secondary }}>
                  Estimated
                </span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  ₹{order.estimatedAmount}
                </span>
              </div>
              <Input
                label="Final Price (₹)"
                value={finalAmt}
                onChange={setFinalAmt}
                onBlur={() =>
                  persist({
                    finalAmount: finalAmt ? Number(finalAmt) : undefined,
                  })
                }
                theme="green"
              />
              <p style={{ fontSize: 11, color: T.text.muted, marginTop: 8 }}>
                Editing this only changes this order — it never changes the
                shop-wide price list.
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  Final Total
                </span>
                <span
                  style={{ fontSize: 24, fontWeight: 800, color: G.accent }}
                >
                  ₹{finalAmt || order.estimatedAmount}
                </span>
              </div>
            </Card>

            <Card
              pad={18}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.text.muted,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Actions
              </div>
              <Btn
                onClick={advance}
                theme="green"
                full
                icon={<Play size={15} />}
                disabled={cancelled || status === "completed"}
              >
                {status === "completed"
                  ? "Order Closed"
                  : "Advance to Next Step"}
              </Btn>
              <Btn
                theme="green"
                variant="secondary"
                full
                icon={<PrinterIcon size={15} />}
              >
                Add to Print Queue
              </Btn>
              {!cancelled && (
                <Btn
                  variant="danger"
                  full
                  icon={<Ban size={15} />}
                  onClick={() => setCancelModal(true)}
                >
                  Cancel Order
                </Btn>
              )}
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={completionPaymentOpen}
        onClose={() => setCompletionPaymentOpen(false)}
        title="Payment for Order"
      >
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: T.text.secondary }}>
            {order.customer} · {order.id}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: G.accent, marginTop: 6 }}>
            ₹{Number(finalAmt || order.finalAmount || order.estimatedAmount).toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 11, color: T.text.muted, marginTop: 3 }}>
            Final order amount
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <Btn
            theme="green"
            full
            icon={<Check size={15} />}
            onClick={async () => {
              const total = Number(
                finalAmt || order.finalAmount || order.estimatedAmount,
              );

              try {
                await adminApi.addOrderDebt(order.id, total, "Paid at counter");
                setCompletionPaymentOpen(false);
                alert("Payment marked as paid.");
              } catch (error) {
                console.error(error);
                alert(
                  error instanceof Error
                    ? error.message
                    : "Failed to record payment.",
                );
              }
            }}
          >
            Mark Paid
          </Btn>

          <div
            style={{
              padding: 14,
              borderRadius: T.r.md,
              background: "rgba(255,106,0,0.06)",
              border: "1px solid rgba(255,106,0,0.16)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
              Customer is paying later / partially
            </div>

            <Input
              label="Amount Paid (₹)"
              value={orderDebtPaid}
              onChange={setOrderDebtPaid}
              placeholder="0"
              theme="green"
            />

            <div style={{ marginTop: 10 }}>
              <Textarea
                label="Note"
                value={orderDebtNote}
                onChange={setOrderDebtNote}
                placeholder="Optional note"
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <Btn
                theme="green"
                variant="secondary"
                full
                icon={<Wallet size={15} />}
                onClick={addOrderToDebt}
              >
                Add to Debt
              </Btn>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        title="Cancel Order"
      >
        <p
          style={{
            fontSize: 14,
            color: T.text.secondary,
            marginBottom: 16,
            lineHeight: 1.55,
          }}
        >
          Cancel order <strong style={{ color: G.accent }}>{order.id}</strong>?
          It stays in your order history for reports — this doesn't delete
          anything.
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 20,
          }}
        >
          {CANCEL_REASONS.map((r) => (
            <label
              key={r}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="cancelReason"
                checked={cancelReason === r}
                onChange={() => setCancelReason(r)}
              />
              {r}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn onClick={() => setCancelModal(false)} variant="ghost" full>
            Back
          </Btn>
          <Btn
            variant="danger"
            full
            icon={<Ban size={15} />}
            onClick={confirmCancel}
          >
            Confirm Cancel
          </Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─── Print Queue (software job list only — no fake hardware claims) ───

function QueueScreen({
  orders,
  onOpenFile,
}: {
  orders: Order[];
  onOpenFile: (o: Order) => void;
}) {
  const queued = orders.filter((o) => ["printing", "ready"].includes(o.status));

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <Topbar
        title="Print Queue"
        subtitle="Jobs waiting or in progress"
        orders={orders}
        onOpenOrder={() => {}}
      />
      <div style={{ padding: "24px 28px", position: "relative", zIndex: 1 }}>
        

        <div className="penter d3">
          <Card pad={0}>
            <div
              style={{
                padding: "14px 24px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              Active Print Jobs
            </div>
            {queued.length === 0 ? (
              <div
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  color: T.text.muted,
                }}
              >
                <Printer
                  size={40}
                  style={{ margin: "0 auto 12px", opacity: 0.25 }}
                />
                <div style={{ fontSize: 14 }}>
                  No jobs in the queue right now
                </div>
              </div>
            ) : (
              queued.map((order, i, arr) => (
                <div
                  key={order.id}
                  style={{
                    padding: "16px 24px",
                    borderBottom:
                      i < arr.length - 1
                        ? "1px solid rgba(255,255,255,0.04)"
                        : "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: G.a14,
                      border: `1px solid ${G.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 800,
                      color: G.accent,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <Avatar name={order.customer} size={36} theme="green" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        {order.customer}
                      </span>
                      <span
                        className="mono"
                        style={{ fontSize: 11, color: T.text.muted }}
                      >
                        {order.id}
                      </span>
                      <StatusBadge status={order.status} />
                    </div>
                    <div style={{ fontSize: 11, color: T.text.muted }}>
                      {order.copies}× {order.paper} ·{" "}
                      {order.color === "color" ? "Color" : "B&W"} ·{" "}
                      {order.sides}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => onOpenFile(order)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "6px 12px",
                        borderRadius: T.r.md,
                        background: G.a10,
                        border: `1px solid ${G.border}`,
                        cursor: "pointer",
                        color: G.accent,
                        fontSize: 12,
                        fontFamily: "inherit",
                      }}
                    >
                      <Eye size={13} /> Open File
                    </button>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Debt / Ledger ──────────────────────────────────────────────────

function LedgerScreen({ orders }: { orders: Order[] }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "due" | "partial" | "settled">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [payModal, setPayModal] = useState<LedgerEntry | null>(null);
  const [payAmount, setPayAmount] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);

    adminApi
      .getLedger()
      .then(setEntries)
      .catch((err) => {
        console.error("Ledger load error:", err);
        setError(err instanceof Error ? err.message : "Failed to load ledger.");
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = entries
    .filter((e) => filter === "all" || e.status === filter)
    .filter(
      (e) =>
        !search ||
        e.customer.toLowerCase().includes(search.toLowerCase()) ||
        (e.orderId ?? "").toLowerCase().includes(search.toLowerCase()),
    );

  const totalOutstanding = entries.reduce(
    (s, e) => s + (e.totalAmount - e.amountPaid),
    0,
  );

  const recordPayment = async () => {
    if (!payModal) return;

    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    try {
      const token = sessionStorage_safe_get();
      if (!token)
        throw new Error("Admin session expired. Please sign in again.");

      const response = await fetch(
        `http://localhost:5000/api/ledger/${payModal.id}/payments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ amount }),
        },
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to record payment.");
      }

      setEntries(await adminApi.getLedger());
      setPayModal(null);
      setPayAmount("");
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error ? error.message : "Failed to record payment.",
      );
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <Topbar
        title="Debt / Ledger"
        subtitle="Shop bookkeeping — not customer online payment"
        orders={orders}
        onOpenOrder={() => {}}
      />
      <div style={{ padding: "24px 28px", position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 14,
            marginBottom: 20,
          }}
        >
          <StatCard
            label="Total Outstanding"
            value={`₹${totalOutstanding}`}
            icon={<Wallet size={18} />}
            color="orange"
          />
          <StatCard
            label="Due"
            value={String(entries.filter((e) => e.status === "due").length)}
            icon={<AlertCircle size={18} />}
            color="orange"
          />
          <StatCard
            label="Settled"
            value={String(entries.filter((e) => e.status === "settled").length)}
            icon={<CheckCircle2 size={18} />}
            color="green"
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: T.text.muted,
              }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer or order ID…"
              style={{
                width: "100%",
                height: 38,
                boxSizing: "border-box",
                paddingLeft: 36,
                paddingRight: 14,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: T.r.md,
                color: T.text.primary,
                fontSize: 13,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["all", "due", "partial", "settled"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 12px",
                  borderRadius: T.r.md,
                  fontSize: 12,
                  fontWeight: 500,
                  background: filter === f ? G.a14 : "rgba(255,255,255,0.04)",
                  border: `1px solid ${filter === f ? G.border : "rgba(255,255,255,0.08)"}`,
                  color: filter === f ? G.accent : T.text.secondary,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <Btn theme="green" icon={<Plus size={15} />}>
            New Entry
          </Btn>
        </div>

        {loading ? (
          <Card>
            <div
              style={{
                padding: "40px 24px",
                textAlign: "center",
                color: T.text.muted,
                fontSize: 13,
              }}
            >
              Loading ledger…
            </div>
          </Card>
        ) : error ? (
          <Card>
            <div
              style={{
                padding: "40px 24px",
                textAlign: "center",
                color: "#f87171",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          </Card>
        ) : (
          <Card pad={0}>
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "40px 24px",
                  textAlign: "center",
                  color: T.text.muted,
                  fontSize: 13,
                }}
              >
                No ledger entries match.
              </div>
            ) : (
              filtered.map((e, i, arr) => (
                <div
                  key={e.id}
                  style={{
                    padding: "14px 24px",
                    borderBottom:
                      i < arr.length - 1
                        ? "1px solid rgba(255,255,255,0.04)"
                        : "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <Avatar name={e.customer} size={34} theme="green" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {e.customer}
                    </div>
                    <div style={{ fontSize: 11, color: T.text.muted }}>
                      {e.orderId ?? "—"} · {e.createdAt}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{ fontSize: 13, fontWeight: 700, color: G.accent }}
                    >
                      ₹{e.totalAmount - e.amountPaid} due
                    </div>
                    <div style={{ fontSize: 11, color: T.text.muted }}>
                      of ₹{e.totalAmount}
                    </div>
                  </div>
                  <Badge
                    label={e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                    color={
                      e.status === "settled"
                        ? "green"
                        : e.status === "partial"
                          ? "orange"
                          : "default"
                    }
                  />
                  {e.status !== "settled" && (
                    <Btn
                      size="sm"
                      theme="green"
                      variant="secondary"
                      onClick={() => setPayModal(e)}
                    >
                      Record Payment
                    </Btn>
                  )}
                </div>
              ))
            )}
          </Card>
        )}
      </div>

      <Modal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        title="Record Payment"
      >
        {payModal && (
          <>
            <p
              style={{
                fontSize: 13,
                color: T.text.secondary,
                marginBottom: 14,
              }}
            >
              {payModal.customer} — ₹
              {payModal.totalAmount - payModal.amountPaid} remaining
            </p>
            <Input
              label="Amount Paid (₹)"
              value={payAmount}
              onChange={setPayAmount}
              theme="green"
            />
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <Btn variant="ghost" full onClick={() => setPayModal(null)}>
                Cancel
              </Btn>
              <Btn theme="green" full onClick={recordPayment}>
                Save Payment
              </Btn>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// ─── Reports (simplified) ──────────────────────────────────────────────
// ─── Reports ──────────────────────────────────────────────────────────────
// ─── Reports ──────────────────────────────────────────────────────────────

function ReportsScreen({ orders }: { orders: Order[] }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  useEffect(() => {
    setLedgerLoading(true);
    setLedgerError(null);

    adminApi
      .getLedger()
      .then(setEntries)
      .catch((err) => {
        console.error("Reports ledger load error:", err);
        setLedgerError(
          err instanceof Error ? err.message : "Failed to load debt records.",
        );
      })
      .finally(() => setLedgerLoading(false));
  }, []);

  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "all">("today");
  const [reportView, setReportView] = useState<"reports" | "debt">("reports");
  const [reportFilter, setReportFilter] = useState<"all" | "website" | "walk-in" | "due" | "paid">("all");

  const [search, setSearch] = useState("");

  const [paymentEntry, setPaymentEntry] = useState<LedgerEntry | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");

  const [detailsEntry, setDetailsEntry] = useState<LedgerEntry | null>(null);

  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInCustomer, setWalkInCustomer] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInAmount, setWalkInAmount] = useState("");
  const [walkInPaid, setWalkInPaid] = useState("0");
  const [walkInNotes, setWalkInNotes] = useState("");

  // ─────────────────────────────────────────────────────────────
  // BASIC REPORT DATA
  // ─────────────────────────────────────────────────────────────

  const reportEntries = entries.filter(
    (entry) => entry.order?.status !== "cancelled",
  );

  const reportOrders = orders.filter((order) => order.status !== "cancelled");

  const completedOrders = reportOrders.filter((o) => o.status === "completed");

  const totalOrderValue = reportOrders.reduce(
    (sum, order) =>
      sum + Number(order.finalAmount ?? order.estimatedAmount ?? 0),
    0,
  );

  const totalCollected = reportEntries.reduce(
    (sum, entry) => sum + Number(entry.amountPaid || 0),
    0,
  );

  const totalOutstanding = reportEntries.reduce(
    (sum, entry) =>
      sum +
      Math.max(
        0,
        Number(entry.totalAmount || 0) - Number(entry.amountPaid || 0),
      ),
    0,
  );

  // ─────────────────────────────────────────────────────────────
  // ACTIVE DEBT
  //
  // Show every unpaid debt, including balances below ₹45.
  // A debt disappears only when its remaining balance reaches ₹0
  // or its status becomes settled.
  // ─────────────────────────────────────────────────────────────

  const activeDebts = reportEntries
    .map((entry) => {
      const linkedOrder = entry.orderId
        ? orders.find((order) => order.id === entry.orderId)
        : undefined;

      return {
        ...entry,
        customer:
          entry.customer?.trim() ||
          entry.order?.customer?.trim() ||
          linkedOrder?.customer?.trim() ||
          "Unknown Customer",
        phone:
          entry.phone?.trim() ||
          entry.order?.phone?.trim() ||
          linkedOrder?.phone?.trim() ||
          "",
        orderId:
          entry.orderId ||
          entry.order?.id ||
          linkedOrder?.id ||
          null,
      };
    })
    .filter((entry) => {
      const remaining =
        Number(entry.totalAmount || 0) -
        Number(entry.amountPaid || 0);

      return entry.status !== "settled" && remaining > 0;
    })
    .filter((entry) => {
      if (!search.trim()) return true;

      const query = search.toLowerCase().trim();

      return (
        entry.customer.toLowerCase().includes(query) ||
        (entry.orderId || "").toLowerCase().includes(query)
      );
    });

  const activeDebtTotal = activeDebts.reduce(
    (sum, entry) =>
      sum +
      Math.max(
        0,
        Number(entry.totalAmount || 0) -
          Number(entry.amountPaid || 0),
      ),
    0,
  );

  // A practical shop ledger: website orders and walk-in entries share
  // one activity list, while the source remains visible for bookkeeping.
  const reportRows = [
    ...reportOrders.map((order) => {
          const linkedLedger = reportEntries.find((entry) => entry.orderId === order.id);
      const amount = Number(order.finalAmount ?? order.estimatedAmount ?? 0);
      const paid = Number(linkedLedger?.amountPaid ?? 0);

      return {
        id: `order-${order.id}`,
        customer: order.customer || "Unknown Customer",
        source: "Website",
        reason: order.service === "passport" ? "Passport photos" : "Document printing",
        amount,
        paid,
        due: Math.max(0, amount - paid),
        status: linkedLedger?.status ?? order.status,
        orderId: order.id,
      };
    }),
    ...reportEntries
      .filter((entry) => !entry.orderId)
      .map((entry) => ({
        id: `walkin-${entry.id}`,
        customer: entry.customer || "Walk-in Customer",
        source: "Walk-in",
        reason: entry.note || "Manual shop entry",
        amount: Number(entry.totalAmount || 0),
        paid: Number(entry.amountPaid || 0),
        due: Math.max(
          0,
          Number(entry.totalAmount || 0) - Number(entry.amountPaid || 0),
        ),
        status: entry.status,
        orderId: null,
      })),
  ];

  const visibleReportRows = reportRows
    .filter((row) => {
      if (reportFilter === "website") return row.source === "Website";
      if (reportFilter === "walk-in") return row.source === "Walk-in";
      if (reportFilter === "due") return row.due > 0;
      if (reportFilter === "paid") return row.due === 0;
      return true;
    })
    .filter((row) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return `${row.customer} ${row.reason} ${row.source} ${row.orderId || ""}`
        .toLowerCase()
        .includes(query);
    });

  // ─────────────────────────────────────────────────────────────
  // RECORD PAYMENT
  // ─────────────────────────────────────────────────────────────

  const recordPayment = async () => {
    if (!paymentEntry) return;

    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    try {
      const token = sessionStorage_safe_get();
      if (!token)
        throw new Error("Admin session expired. Please sign in again.");

      const response = await fetch(
        `http://localhost:5000/api/ledger/${paymentEntry.id}/payments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ amount }),
        },
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to record payment.");
      }

      setEntries(await adminApi.getLedger());
      setPaymentEntry(null);
      setPaymentAmount("");
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error ? error.message : "Failed to record payment.",
      );
    }
  };

  // ─────────────────────────────────────────────────────────────
  // CLEAR DEBT
  // ─────────────────────────────────────────────────────────────

  const clearDebt = async (entryId: string) => {
    try {
      const token = sessionStorage_safe_get();
      if (!token)
        throw new Error("Admin session expired. Please sign in again.");

      const confirmed = window.confirm(
        "Clear this debt? This will record the remaining amount as paid and mark the debt as settled.",
      );
      if (!confirmed) return;

      const response = await fetch(
        `http://localhost:5000/api/ledger/${entryId}/clear`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to clear debt.");
      }

      setEntries(await adminApi.getLedger());
      setDetailsEntry(null);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to clear debt.");
    }
  };


  const clearWalkInRecords = async () => {
    const walkInCount = entries.filter((entry) => !entry.orderId).length;

    if (walkInCount === 0) {
      alert("There are no manual walk-in records to clear.");
      return;
    }

    const confirmed = window.confirm(
      `Clear ${walkInCount} manual walk-in record(s)? Website-linked records will be skipped and preserved.`,
    );
    if (!confirmed) return;

    try {
      const token = sessionStorage_safe_get();
      if (!token) throw new Error("Admin session expired. Please sign in again.");

      const response = await fetch("http://localhost:5000/api/ledger/walk-in", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to clear walk-in records.");
      }

      setEntries(await adminApi.getLedger());
      alert(
        `${data.message} Website customer records were not deleted.`,
      );
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to clear walk-in records.");
    }
  };

  const createWalkInDebt = async () => {
    const customer = walkInCustomer.trim();
    const total = Number(walkInAmount);
    const paid = Number(walkInPaid || 0);

    if (!customer) {
      alert("Customer name is required.");
      return;
    }

    if (!Number.isFinite(total) || total <= 0) {
      alert("Enter a valid total amount.");
      return;
    }

    if (!Number.isFinite(paid) || paid < 0 || paid > total) {
      alert("Paid amount must be between ₹0 and the total amount.");
      return;
    }

    try {
      await adminApi.createWalkInDebt({
        customer,
        phone: walkInPhone.trim() || undefined,
        totalAmount: total,
        amountPaid: paid,
        notes: walkInNotes.trim() || undefined,
      });

      setEntries(await adminApi.getLedger());
      setWalkInOpen(false);
      setWalkInCustomer("");
      setWalkInPhone("");
      setWalkInAmount("");
      setWalkInPaid("0");
      setWalkInNotes("");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to create debt entry.");
    }
  };

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
      }}
    >
      {/* =========================================================
          TOPBAR
      ========================================================= */}

      <Topbar
        title="Reports"
        subtitle="Shop reports and outstanding payments"
        orders={orders}
        onOpenOrder={() => {}}
      />

      <div
        style={{
          padding: "24px 28px 40px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 220px))",
            gap: 6,
            padding: 5,
            marginBottom: 22,
            width: "fit-content",
            maxWidth: "100%",
            background: "rgba(255,255,255,0.035)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: T.r.lg,
          }}
        >
          {(["reports", "debt"] as const).map((view) => (
            <button
              key={view}
              onClick={() => setReportView(view)}
              style={{
                height: 40,
                padding: "0 24px",
                borderRadius: T.r.md,
                border: "none",
                cursor: "pointer",
                background: reportView === view ? G.a10 : "transparent",
                color: reportView === view ? G.accent : T.text.muted,
                fontSize: 12,
                fontWeight: reportView === view ? 700 : 500,
                transition: "all 0.18s ease",
                fontFamily: "inherit",
                textTransform: "capitalize",
              }}
            >
              {view === "reports" ? "Reports" : "Debt"}
            </button>
          ))}
        </div>

        {reportView === "reports" && (
          <>
        {/* =======================================================
            REPORT PERIOD
        ======================================================= */}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          

          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            {(
              [
                ["today", "Today"],
                ["7d", "7 Days"],
                ["30d", "30 Days"],
                ["all", "All Records"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                style={{
                  padding: "7px 13px",
                  borderRadius: T.r.md,

                  border: `1px solid ${
                    period === value ? G.border : "rgba(255,255,255,0.08)"
                  }`,

                  background:
                    period === value ? G.a14 : "rgba(255,255,255,0.035)",

                  color: period === value ? G.accent : T.text.secondary,

                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 18,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: T.text.muted,
              }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer, purpose or order ID…"
              style={{
                width: "100%",
                height: 38,
                boxSizing: "border-box",
                paddingLeft: 36,
                paddingRight: 14,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: T.r.md,
                color: T.text.primary,
                fontSize: 13,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {([
              ["all", "All"],
              ["website", "Website"],
              ["walk-in", "Walk-in"],
              ["due", "Due"],
              ["paid", "Paid"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setReportFilter(value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: T.r.md,
                  fontSize: 12,
                  fontWeight: 500,
                  background: reportFilter === value ? G.a14 : "rgba(255,255,255,0.04)",
                  border: `1px solid ${reportFilter === value ? G.border : "rgba(255,255,255,0.08)"}`,
                  color: reportFilter === value ? G.accent : T.text.secondary,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={clearWalkInRecords}
            style={{
              height: 32,
              padding: "0 11px",
              borderRadius: T.r.md,
              border: "1px solid rgba(248,113,113,0.28)",
              background: "rgba(248,113,113,0.07)",
              color: "#fca5a5",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Clear Walk-ins
          </button>
          <Btn
            onClick={() => setWalkInOpen(true)}
            theme="green"
            size="sm"
            icon={<Plus size={14} />}
          >
            Add Walk-in
          </Btn>
        </div>

        <Card pad={0}>
          <Table<typeof visibleReportRows[number]>
            rows={visibleReportRows}
            emptyState={
              <div style={{ textAlign: "center", color: T.text.muted }}>
                <List size={32} style={{ margin: "0 auto 10px", opacity: 0.3 }} />
                <div style={{ fontSize: 14 }}>No customer activity matches this filter</div>
              </div>
            }
            cols={[
              {
                key: "customer",
                label: "Customer",
                render: (row) => (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={row.customer} size={30} theme="green" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{row.customer}</div>
                      <div style={{ fontSize: 11, color: T.text.muted }}>{row.orderId || "Walk-in record"}</div>
                    </div>
                  </div>
                ),
              },
              {
                key: "reason",
                label: "Purpose",
                width: "145px",
                render: (row) => (
                  <div>
                    <Badge label={row.reason === "Passport photos" ? "Passport" : row.reason} color={row.reason === "Passport photos" ? "purple" : "blue"} />
                    <div style={{ fontSize: 10, color: T.text.muted, marginTop: 5 }}>{row.source}</div>
                  </div>
                ),
              },
              {
                key: "amount",
                label: "Billed",
                width: "85px",
                align: "right" as const,
                render: (row) => <span style={{ fontSize: 14, fontWeight: 700 }}>₹{row.amount.toLocaleString("en-IN")}</span>,
              },
              {
                key: "paid",
                label: "Paid",
                width: "75px",
                align: "right" as const,
                render: (row) => <span style={{ fontSize: 13, color: G.accent }}>₹{row.paid.toLocaleString("en-IN")}</span>,
              },
              {
                key: "due",
                label: "Due",
                width: "75px",
                align: "right" as const,
                render: (row) => <span style={{ fontSize: 13, fontWeight: 700, color: row.due > 0 ? O.accent : G.accent }}>₹{row.due.toLocaleString("en-IN")}</span>,
              },
              {
                key: "status",
                label: "Status",
                width: "120px",
                render: (row) => <Badge label={row.due > 0 ? (row.status === "partial" ? "Partial" : "Due") : "Paid"} color={row.due > 0 ? "orange" : "green"} />,
              },
            ]}
          />
        </Card>

        </>
        )}

        {reportView === "debt" && (
          <>
        {/* =======================================================
            OUTSTANDING DEBT
        ======================================================= */}

        <Card>
          {/* HEADER */}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Wallet size={18} color={O.accent} />

                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  Outstanding Debt
                </span>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: T.text.muted,
                  marginTop: 5,
                }}
              >
                All due and partial balances, from ₹1 upward
              </div>
            </div>

            <div
              style={{
                textAlign: "right",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: T.text.muted,
                }}
              >
                Active Debt
              </div>

              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: O.accent,
                }}
              >
                ₹{activeDebtTotal.toLocaleString("en-IN")}
              </div>
            </div>

            <button
              onClick={() => setWalkInOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: T.r.md,
                border: `1px solid ${G.border}`,
                background: G.a10,
                color: G.accent,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Plus size={14} />
              Add Walk-in Debt
            </button>
          </div>

          {/* SEARCH */}

          <div
            style={{
              position: "relative",
              marginBottom: 16,
            }}
          >
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: 11,
                color: T.text.muted,
              }}
            />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, phone or order ID..."
              style={{
                width: "100%",
                boxSizing: "border-box",

                padding: "9px 12px 9px 36px",

                borderRadius: T.r.md,

                border: "1px solid rgba(255,255,255,0.08)",

                background: "rgba(255,255,255,0.035)",

                color: T.text.primary,

                outline: "none",

                fontFamily: "inherit",

                fontSize: 12,
              }}
            />
          </div>

          {/* EMPTY, LOADING, AND ERROR STATES */}

          {ledgerLoading ? (
            <div
              style={{
                padding: "42px 20px",
                textAlign: "center",
                color: T.text.muted,
                fontSize: 13,
              }}
            >
              Loading debt records…
            </div>
          ) : ledgerError ? (
            <div
              style={{
                padding: "42px 20px",
                textAlign: "center",
                color: "#f87171",
                fontSize: 13,
              }}
            >
              {ledgerError}
            </div>
          ) : activeDebts.length === 0 ? (
            <div
              style={{
                padding: "42px 20px",
                textAlign: "center",
                borderRadius: T.r.md,

                background: "rgba(255,255,255,0.025)",

                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <CheckCircle2
                size={30}
                color={G.accent}
                style={{
                  marginBottom: 10,
                }}
              />

              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                No outstanding debts
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: T.text.muted,
                  marginTop: 5,
                }}
              >
                Every unpaid balance will appear here until it is settled.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {activeDebts.map((entry) => {
                const remaining = Math.max(
                  0,
                  Number(entry.totalAmount || 0) -
                    Number(entry.amountPaid || 0),
                );

                return (
                  <div
                    key={entry.id}
                    style={{
                      padding: 16,
                      borderRadius: T.r.md,

                      background: "rgba(255,255,255,0.025)",

                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    {/* CUSTOMER + AMOUNTS */}

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                      }}
                    >
                      {/* CUSTOMER */}

                      <div
                        style={{
                          minWidth: 190,
                          flex: 1,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            marginBottom: 4,
                          }}
                        >
                          {entry.customer}
                        </div>

                        {entry.phone && (
                          <div
                            style={{
                              fontSize: 11,
                              color: T.text.muted,
                            }}
                          >
                            {entry.phone}
                          </div>
                        )}

                        <div
                          style={{
                            fontSize: 11,
                            color: T.text.muted,
                            marginTop: 5,
                          }}
                        >
                          {entry.orderId ?? "No order ID"}
                        </div>
                      </div>

                      {/* AMOUNTS */}

                      <div
                        style={{
                          display: "flex",
                          gap: 28,
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 10,
                              color: T.text.muted,
                              marginBottom: 4,
                            }}
                          >
                            BILL
                          </div>

                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          >
                            ₹{entry.totalAmount}
                          </div>
                        </div>

                        <div>
                          <div
                            style={{
                              fontSize: 10,
                              color: T.text.muted,
                              marginBottom: 4,
                            }}
                          >
                            PAID
                          </div>

                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: G.accent,
                            }}
                          >
                            ₹{entry.amountPaid}
                          </div>
                        </div>

                        <div>
                          <div
                            style={{
                              fontSize: 10,
                              color: T.text.muted,
                              marginBottom: 4,
                            }}
                          >
                            DUE
                          </div>

                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 800,
                              color: O.accent,
                            }}
                          >
                            ₹{remaining.toLocaleString("en-IN")}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* DETAILS + ACTIONS */}

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: "1px solid rgba(255,255,255,0.05)",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: T.text.muted,
                          }}
                        >
                          Created: {entry.createdAt}
                        </span>

                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "4px 8px",
                            borderRadius: T.r.pill,
                            background:
                              entry.status === "settled" ? G.a10 : O.a10,
                            border: `1px solid ${
                              entry.status === "settled" ? G.border : O.border
                            }`,
                            color:
                              entry.status === "settled" ? G.accent : O.accent,
                            textTransform: "uppercase",
                          }}
                        >
                          {entry.status}
                        </span>
                        {entry.note && (
                          <span
                            style={{
                              fontSize: 11,
                              color: T.text.muted,
                            }}
                          >
                            {entry.note}
                          </span>
                        )}
                      </div>

                      {/* BUTTONS */}

                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          onClick={() => setDetailsEntry(entry)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "7px 11px",
                            borderRadius: T.r.md,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.04)",
                            color: T.text.secondary,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          <Eye size={13} />
                          View Details
                        </button>

                        <button
                          onClick={() => {
                            setPaymentEntry(entry);
                            setPaymentAmount("");
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "7px 11px",
                            borderRadius: T.r.md,
                            border: `1px solid ${G.border}`,
                            background: G.a10,
                            color: G.accent,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          <Plus size={13} />
                          Add Payment
                        </button>

                        <button
                          onClick={() => clearDebt(entry.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "7px 11px",
                            borderRadius: T.r.md,
                            border: "1px solid rgba(255,106,0,0.25)",
                            background: "rgba(255,106,0,0.07)",
                            color: O.accent,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          <Check size={13} />
                          Clear Debt
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
          </>
        )}
      </div>

      {/* =========================================================
          ADD WALK-IN DEBT MODAL
      ========================================================= */}

      {walkInOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              background: "#11121b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: T.r.lg,
              padding: 22,
              boxShadow: "0 25px 80px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  Add Walk-in Debt
                </div>
                <div style={{ fontSize: 12, color: T.text.muted, marginTop: 4 }}>
                  For customers who pay later at the counter
                </div>
              </div>
              <button
                onClick={() => setWalkInOpen(false)}
                style={{
                  border: "none",
                  background: "rgba(255,255,255,0.05)",
                  color: T.text.secondary,
                  borderRadius: T.r.md,
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Input
                label="Customer Name *"
                value={walkInCustomer}
                onChange={setWalkInCustomer}
                placeholder="Customer name"
                theme="green"
              />
              <Input
                label="Phone Number"
                value={walkInPhone}
                onChange={setWalkInPhone}
                placeholder="Optional"
                theme="green"
              />
              <Input
                label="Total Amount (₹) *"
                value={walkInAmount}
                onChange={setWalkInAmount}
                placeholder="0"
                theme="green"
              />
              <Input
                label="Amount Paid (₹)"
                value={walkInPaid}
                onChange={setWalkInPaid}
                placeholder="0"
                theme="green"
              />
              <Textarea
                label="Description / Notes"
                value={walkInNotes}
                onChange={setWalkInNotes}
                placeholder="e.g. 20 A4 Xerox copies"
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <Btn variant="ghost" full onClick={() => setWalkInOpen(false)}>
                Cancel
              </Btn>
              <Btn theme="green" full onClick={createWalkInDebt}>
                Add Debt
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          ADD PAYMENT MODAL
      ========================================================= */}

      {paymentEntry && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 430,
              background: "#11121b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: T.r.lg,
              padding: 22,
              boxShadow: "0 25px 80px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  Add Payment
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: T.text.muted,
                    marginTop: 4,
                  }}
                >
                  {paymentEntry.customer}
                </div>
              </div>

              <button
                onClick={() => {
                  setPaymentEntry(null);
                  setPaymentAmount("");
                }}
                style={{
                  border: "none",
                  background: "rgba(255,255,255,0.05)",
                  color: T.text.secondary,
                  borderRadius: T.r.md,
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* BILL / REMAINING */}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  padding: 12,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: T.r.md,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: T.text.muted,
                  }}
                >
                  TOTAL BILL
                </div>

                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    marginTop: 4,
                  }}
                >
                  ₹{paymentEntry.totalAmount}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  background: "rgba(255,106,0,0.07)",
                  borderRadius: T.r.md,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: T.text.muted,
                  }}
                >
                  REMAINING
                </div>

                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    color: O.accent,
                    marginTop: 4,
                  }}
                >
                  ₹
                  {Math.max(
                    0,
                    Number(paymentEntry.totalAmount || 0) -
                      Number(paymentEntry.amountPaid || 0),
                  )}
                </div>
              </div>
            </div>

            <input
              autoFocus
              type="number"
              min="1"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="Enter payment amount"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "11px 12px",
                borderRadius: T.r.md,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
                color: T.text.primary,
                outline: "none",
                fontFamily: "inherit",
                fontSize: 13,
                marginBottom: 12,
              }}
            />

            <button
              onClick={recordPayment}
              style={{
                width: "100%",
                padding: 11,
                border: "none",
                borderRadius: T.r.md,
                background: G.accent,
                color: "#07100a",
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Record Payment
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          CUSTOMER DETAILS MODAL
      ========================================================= */}

      {detailsEntry && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "85vh",
              overflowY: "auto",
              background: "#11121b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: T.r.lg,
              padding: 22,
            }}
          >
            {/* HEADER */}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                  }}
                >
                  {detailsEntry.customer}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: T.text.muted,
                    marginTop: 4,
                  }}
                >
                  {detailsEntry.orderId ?? "No order ID"}
                </div>
              </div>

              <button
                onClick={() => setDetailsEntry(null)}
                style={{
                  border: "none",
                  background: "rgba(255,255,255,0.05)",
                  color: T.text.secondary,
                  borderRadius: T.r.md,
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* AMOUNT CARDS */}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 10,
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  padding: 12,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: T.r.md,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: T.text.muted,
                  }}
                >
                  BILL
                </div>

                <div
                  style={{
                    fontWeight: 800,
                    marginTop: 4,
                  }}
                >
                  ₹{detailsEntry.totalAmount}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: T.r.md,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: T.text.muted,
                  }}
                >
                  PAID
                </div>

                <div
                  style={{
                    fontWeight: 800,
                    color: G.accent,
                    marginTop: 4,
                  }}
                >
                  ₹{detailsEntry.amountPaid}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  background: "rgba(255,106,0,0.07)",
                  borderRadius: T.r.md,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: T.text.muted,
                  }}
                >
                  DUE
                </div>

                <div
                  style={{
                    fontWeight: 800,
                    color: O.accent,
                    marginTop: 4,
                  }}
                >
                  ₹
                  {Math.max(
                    0,
                    Number(detailsEntry.totalAmount || 0) -
                      Number(detailsEntry.amountPaid || 0),
                  )}
                </div>
              </div>
            </div>

            {/* CUSTOMER INFO */}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: T.text.muted,
                    marginBottom: 5,
                  }}
                >
                  PHONE
                </div>

                <div
                  style={{
                    fontSize: 13,
                  }}
                >
                  {detailsEntry.phone || "Not provided"}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: T.text.muted,
                    marginBottom: 5,
                  }}
                >
                  CREATED
                </div>

                <div
                  style={{
                    fontSize: 13,
                  }}
                >
                  {detailsEntry.createdAt}
                </div>
              </div>
            </div>

            {/* NOTE */}

            {detailsEntry.note && (
              <div
                style={{
                  padding: 12,
                  borderRadius: T.r.md,
                  background: "rgba(255,255,255,0.035)",
                  marginBottom: 18,
                  fontSize: 12,
                  color: T.text.secondary,
                }}
              >
                <b>Note:</b> {detailsEntry.note}
              </div>
            )}

            {/* PAYMENT HISTORY */}

            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              Payment History
            </div>

            {detailsEntry.paymentHistory.length === 0 ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: T.r.md,
                  background: "rgba(255,255,255,0.03)",
                  color: T.text.muted,
                  fontSize: 12,
                }}
              >
                No payments recorded.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                }}
              >
                {detailsEntry.paymentHistory.map((payment, index) => (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: T.r.md,
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: T.text.secondary,
                      }}
                    >
                      {payment.date}
                    </span>

                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: G.accent,
                      }}
                    >
                      ₹{payment.amount}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ACTIONS */}

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 20,
              }}
            >
              <button
                onClick={() => {
                  setPaymentEntry(detailsEntry);
                  setDetailsEntry(null);
                  setPaymentAmount("");
                }}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: T.r.md,
                  border: `1px solid ${G.border}`,
                  background: G.a10,
                  color: G.accent,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Add Payment
              </button>

              <button
                onClick={() => clearDebt(detailsEntry.id)}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: T.r.md,
                  border: "1px solid rgba(255,106,0,0.25)",
                  background: "rgba(255,106,0,0.07)",
                  color: O.accent,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Clear Debt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ─── Storage (reframed around file retention, not raw GB) ─────────────

type StorageFile = {
  id: number;
  orderId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  ageHours: number;
  isExpired: boolean;
  exists: boolean;
  customer: string;
  service: string;
};

function StorageScreen() {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(true);

  const loadFiles = async () => {
    try {
      setError(null);
      const token = sessionStorage_safe_get();
      if (!token) throw new Error("Admin session expired. Please sign in again.");
      const response = await fetch("http://localhost:5000/api/storage/files", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Failed to scan storage.");
      setFiles(data.files || []);
    } catch (err) {
      console.error("Storage load error:", err);
      setError(err instanceof Error ? err.message : "Failed to scan storage.");
    } finally {
      setLoading(false);
    }
  };

  const loadStorageSettings = async () => {
    try {
      const token = sessionStorage_safe_get();
      if (!token) return;
      const response = await fetch("http://localhost:5000/api/storage/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok && data.success) setAutoCleanupEnabled(data.settings?.autoCleanupEnabled !== false);
    } catch (err) {
      console.error("Storage settings load error:", err);
    }
  };

  useEffect(() => {
    void Promise.all([loadFiles(), loadStorageSettings()]);
  }, []);

  const clearExpiredFiles = async () => {
    const expiredCount = files.filter((file) => file.isExpired).length;
    if (expiredCount === 0) {
      alert("There are no files older than 24 hours to remove.");
      return;
    }
    if (!window.confirm(`Remove ${expiredCount} file(s) older than 24 hours? Order history will be preserved.`)) return;

    try {
      setBusy(true);
      const token = sessionStorage_safe_get();
      if (!token) throw new Error("Admin session expired. Please sign in again.");
      const response = await fetch("http://localhost:5000/api/storage/cleanup", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Failed to clean storage.");
      await loadFiles();
      alert(data.message);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to clean storage.");
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoCleanup = async () => {
    try {
      setBusy(true);
      const token = sessionStorage_safe_get();
      if (!token) throw new Error("Admin session expired. Please sign in again.");
      const nextValue = !autoCleanupEnabled;
      const response = await fetch("http://localhost:5000/api/storage/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ autoCleanupEnabled: nextValue }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to update cleanup setting.");
      setAutoCleanupEnabled(nextValue);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to update cleanup setting.");
    } finally {
      setBusy(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const usedBytes = files.reduce((sum, file) => sum + file.size, 0);
  const quotaBytes = 1024 * 1024 * 1024;
  const availableBytes = Math.max(0, quotaBytes - usedBytes);
  const usagePercent = Math.min(100, (usedBytes / quotaBytes) * 100);
  const expiredCount = files.filter((file) => file.isExpired).length;
  const missingCount = files.filter((file) => !file.exists).length;
  const pdfBytes = files.filter((file) => file.mimeType === "application/pdf").reduce((sum, file) => sum + file.size, 0);
  const imageBytes = files.filter((file) => file.mimeType.startsWith("image/")).reduce((sum, file) => sum + file.size, 0);
  const otherBytes = Math.max(0, usedBytes - pdfBytes - imageBytes);
  const ringRadius = 82;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <Topbar title="Storage" subtitle="Workspace capacity and cleanup" orders={[]} onOpenOrder={() => {}} />
      <div style={{ padding: "24px 28px 40px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: T.text.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 6 }}>Storage overview</div>
            <div style={{ fontSize: 13, color: T.text.secondary }}>Uploaded print files and available workspace capacity</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void toggleAutoCleanup()} disabled={busy} aria-pressed={autoCleanupEnabled} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 34, padding: "0 11px", borderRadius: T.r.md, border: `1px solid ${autoCleanupEnabled ? "rgba(126,226,168,0.22)" : "rgba(255,255,255,0.10)"}`, background: autoCleanupEnabled ? "rgba(126,226,168,0.08)" : "rgba(255,255,255,0.04)", color: autoCleanupEnabled ? G.accent : T.text.muted, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}><Clock size={14} /><span>Auto cleanup</span><span style={{ width: 28, height: 16, borderRadius: 999, padding: 2, background: autoCleanupEnabled ? G.accent : "rgba(255,255,255,0.18)", display: "flex", justifyContent: autoCleanupEnabled ? "flex-end" : "flex-start", alignItems: "center" }}><span style={{ width: 12, height: 12, borderRadius: "50%", background: "#07100d" }} /></span><span>{autoCleanupEnabled ? "On" : "Off"}</span></button>
            <Btn onClick={() => void loadFiles()} disabled={busy} theme="green" variant="ghost" icon={<RefreshCw size={14} />}>Scan Now</Btn>
            <Btn onClick={clearExpiredFiles} disabled={busy} theme="green" variant="secondary" icon={<Trash2 size={14} />}>Clear Expired</Btn>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1.05fr) minmax(300px, 1fr)", gap: 16, marginBottom: 16 }}>
          <Card pad={0}>
            <div style={{ padding: "20px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}><HardDrive size={17} color={G.accent} /><span style={{ fontSize: 14, fontWeight: 700 }}>Workspace storage</span></div>
              <span style={{ fontSize: 11, color: T.text.muted }}>1 GB quota</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "24px 22px" }}>
              <div style={{ width: 190, height: 190, position: "relative", flexShrink: 0 }}>
                <svg width="190" height="190" viewBox="0 0 190 190" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="95" cy="95" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="16" />
                  <circle cx="95" cy="95" r={ringRadius} fill="none" stroke={usagePercent > 80 ? O.accent : G.accent} strokeWidth="16" strokeLinecap="round" strokeDasharray={ringCircumference} strokeDashoffset={ringCircumference * (1 - usagePercent / 100)} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.04em" }}>{usagePercent < 0.1 ? "<0.1" : usagePercent.toFixed(1)}%</div>
                  <div style={{ fontSize: 11, color: T.text.muted, marginTop: 3 }}>used</div>
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em", color: T.text.primary }}>{formatBytes(usedBytes)}</div>
                <div style={{ fontSize: 12, color: T.text.muted, marginTop: 4 }}>currently consumed</div>
                <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "18px 0" }} />
                <div style={{ fontSize: 18, fontWeight: 700, color: G.accent }}>{formatBytes(availableBytes)}</div>
                <div style={{ fontSize: 12, color: T.text.muted, marginTop: 4 }}>available space</div>
              </div>
            </div>
          </Card>

          <Card pad={0}>
            <div style={{ padding: "20px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 9 }}><FolderOpen size={17} color={G.accent} /><span style={{ fontSize: 14, fontWeight: 700 }}>Space by file type</span></div>
            <div style={{ padding: "8px 22px 14px" }}>
              {[
                ["PDF documents", pdfBytes, FileText, "#8ab4ff"],
                ["Images", imageBytes, Eye, "#c4a7ff"],
                ["Other files", otherBytes, HardDrive, "#7ee2a8"],
              ].map(([label, bytes, Icon, color]) => (
                <div key={String(label)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 0", borderBottom: "1px solid rgba(255,255,255,0.055)" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: `${String(color)}18`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={15} color={String(color)} /></div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: T.text.secondary }}>{label}</div><div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 99, marginTop: 7, overflow: "hidden" }}><div style={{ height: "100%", width: `${usedBytes ? Math.max(2, (Number(bytes) / usedBytes) * 100) : 0}%`, background: String(color), borderRadius: 99 }} /></div></div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>{formatBytes(Number(bytes))}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 15, fontSize: 11, color: T.text.muted }}><span>{files.length} uploaded files</span><span>{expiredCount} expired · {missingCount} missing</span></div>
            </div>
          </Card>
        </div>


        {error && <div style={{ marginTop: 16, padding: 14, color: "#f87171", border: "1px solid rgba(248,113,113,0.2)", borderRadius: T.r.md }}>{error}</div>}
        {loading && <div style={{ padding: 30, textAlign: "center", color: T.text.muted }}>Reading storage usage…</div>}
      </div>
    </div>
  );
}

// ─── Settings ──────────────────────────────────────────────────────────

function SettingsScreen() {
  type SettingsTab = "general" | "menu" | "printers" | "scanner";
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [shopName, setShopName] = useState(SHOP_SETTINGS.name);
  const [whatsapp, setWhatsapp] = useState(SHOP_SETTINGS.whatsapp);
  const [email, setEmail] = useState(SHOP_SETTINGS.email);
  const [address, setAddress] = useState("");
  const [portalUrl, setPortalUrl] = useState(SHOP_SETTINGS.customerPortalUrl);

  const [qrGenerated, setQrGenerated] = useState(false);
  const [qrTheme, setQrTheme] = useState<"orange-white" | "orange-black">(
    "orange-black",
  );

  const [printers, setPrinters] = useState<PrinterEntry[]>([]);
  const [printerLoading, setPrinterLoading] = useState(false);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  // Points ONLY to the actual poster preview.
  // Download and Print use this element instead of the whole admin page.
  const posterRef = useRef<HTMLDivElement>(null);

  const flash = (msg: string) => {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(null), 2000);
  };

  const saveShopDetails = () => flash("Shop details saved.");

  const detectPrinters = async () => {
    if (printerLoading) return;

    setPrinterLoading(true);
    setPrinterError(null);

    try {
      const detected = await adminApi.getPrinters();
      setPrinters(detected);

      if (detected.length === 0) {
        setPrinterError(
          "No printers are currently installed or available on this Windows PC.",
        );
      } else {
        flash(
          `${detected.length} printer${detected.length === 1 ? "" : "s"} detected.`,
        );
      }
    } catch (error) {
      console.error("Printer detection failed:", error);
      setPrinterError(
        error instanceof Error ? error.message : "Unable to detect printers.",
      );
    } finally {
      setPrinterLoading(false);
    }
  };

  useEffect(() => {
    if (settingsTab === "printers") {
      detectPrinters();
    }
  }, [settingsTab]);

  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=700x700&margin=12&data=${encodeURIComponent(portalUrl)}`;

  const generatePoster = () => {
    if (!shopName.trim()) {
      flash("Enter your shop name first.");
      return;
    }

    if (!portalUrl.trim()) {
      flash("Enter the customer portal URL first.");
      return;
    }

    setQrGenerated(true);
    flash("QR poster generated.");
  };

  const printPoster = () => {
    const poster = posterRef.current;

    if (!poster) {
      flash("Generate the poster first.");
      return;
    }

    // Print ONLY the poster in a separate window.
    // The poster preview uses fixed pixel sizes for its internal design.
    // We therefore keep the original 520px poster size and scale the whole
    // poster proportionally to A4 instead of stretching the outer container.
    const printWindow = window.open("", "_blank", "width=900,height=1200");

    if (!printWindow) {
      flash("Allow pop-ups in the browser to print the poster.");
      return;
    }

    const posterHtml = poster.outerHTML;

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${shopName || "Shop"} QR Poster</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }

            * {
              box-sizing: border-box;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              width: 210mm;
              height: 297mm;
              overflow: hidden;
              background: #fff;
            }

            body {
              position: relative;
              display: block;
            }

            /*
             * The live preview is 520px wide and 210:297.
             * Keep that exact design size, then scale the complete poster
             * to the physical A4 page. This keeps every internal element
             * (QR, headline, CTA, shop-info card, footer) proportional.
             */
            .qr-poster-print {
              width: 520px !important;
              height: 735.43px !important;
              max-width: none !important;
              aspect-ratio: 210 / 297 !important;
              margin: 0 !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              overflow: hidden !important;
              transform: scale(1.5269230769);
              transform-origin: top left;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }

            img {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          </style>
        </head>
        <body>
          ${posterHtml}
        </body>
      </html>
    `);
    printWindow.document.close();

    const doPrint = () => {
      printWindow.focus();
      printWindow.print();
      setTimeout(() => printWindow.close(), 1000);
    };

    const images = Array.from(printWindow.document.images);

    if (images.length === 0) {
      setTimeout(doPrint, 300);
      return;
    }

    let remaining = images.length;
    let printed = false;

    const finish = () => {
      if (printed) return;
      remaining -= 1;

      if (remaining <= 0) {
        printed = true;
        doPrint();
      }
    };

    images.forEach((image) => {
      if (image.complete) {
        finish();
      } else {
        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
      }
    });

    // Safety timeout for a slow QR image.
    setTimeout(() => {
      if (!printed) {
        printed = true;
        doPrint();
      }
    }, 2500);
  };

  const downloadPoster = async () => {
    const poster = posterRef.current;

    if (!poster) {
      flash("Generate the poster first.");
      return;
    }

    try {
      /*
       * html2canvas is loaded only when Download Poster is clicked.
       * Install once in the project:
       *
       * npm install html2canvas
       */
      const { default: html2canvas } = await import("html2canvas");

      const canvas = await html2canvas(poster, {
        scale: 2,
        useCORS: true,
        backgroundColor: qrTheme === "orange-black" ? "#050505" : "#ffffff",
        logging: false,
      });

      const link = document.createElement("a");
      const safeName =
        (shopName || "shop")
          .trim()
          .replace(/[^a-z0-9]+/gi, "-")
          .toLowerCase() || "shop";

      link.download = `${safeName}-qr-poster.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      flash("Poster downloaded.");
    } catch (error) {
      console.error("Poster download failed:", error);
      alert(
        'Poster download needs html2canvas. Run "npm install html2canvas" once, then try again.',
      );
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "general", label: "General" },
    { id: "menu", label: "Menu" },
    { id: "printers", label: "Printers" },
    { id: "scanner", label: "Scanner / QR" },
  ];
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <Topbar
        title="Settings"
        subtitle="Shop configuration and preferences"
        orders={[]}
        onOpenOrder={() => {}}
      />

      <div style={{ padding: "24px 28px", position: "relative", zIndex: 1 }}>
        <div
          style={{
            maxWidth: 760,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* SETTINGS TABS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
              gap: 6,
              padding: 5,
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: T.r.lg,
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSettingsTab(tab.id)}
                style={{
                  height: 40,
                  borderRadius: T.r.md,
                  border: "none",
                  cursor: "pointer",
                  background: settingsTab === tab.id ? G.a10 : "transparent",
                  color: settingsTab === tab.id ? G.accent : T.text.muted,
                  fontSize: 12,
                  fontWeight: settingsTab === tab.id ? 700 : 500,
                  transition: "all 0.18s ease",
                  fontFamily: "inherit",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {savedFlash && (
            <div
              style={{
                padding: "10px 14px",
                background: G.a10,
                border: `1px solid ${G.border}`,
                borderRadius: T.r.md,
                fontSize: 13,
                color: G.accent,
              }}
            >
              {savedFlash}
            </div>
          )}

          {/* GENERAL */}
          {settingsTab === "general" && (
            <div className="penter d0">
              <Card>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: T.text.muted,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: 18,
                  }}
                >
                  Shop Details
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  <Input
                    label="Shop Name"
                    value={shopName}
                    onChange={setShopName}
                    theme="green"
                  />

                  <Input
                    label="WhatsApp Number"
                    value={whatsapp}
                    onChange={setWhatsapp}
                    theme="green"
                  />

                  <Input
                    label="Email"
                    value={email}
                    onChange={setEmail}
                    theme="green"
                  />
                </div>

                <div style={{ marginTop: 16 }}>
                  <Btn
                    onClick={saveShopDetails}
                    theme="green"
                    icon={<Check size={15} />}
                  >
                    Save Shop Details
                  </Btn>
                </div>
              </Card>
            </div>
          )}
          {/* MENU */}
          {settingsTab === "menu" && (
            <div className="penter d1">
              <MenuManager />
            </div>
          )}

          {/* PRINTERS */}
          {settingsTab === "printers" && (
            <div className="penter d2">
              <Card>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: T.text.muted,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      Detected Printers
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 12,
                        color: T.text.muted,
                      }}
                    >
                      USB and Wi-Fi/network printers installed or available on
                      this Windows PC.
                    </div>
                  </div>

                  <Btn
                    onClick={detectPrinters}
                    theme="green"
                    variant="secondary"
                    size="sm"
                    icon={<RefreshCw size={14} />}
                    disabled={printerLoading}
                  >
                    {printerLoading ? "Detecting…" : "Detect Printers"}
                  </Btn>
                </div>

                {printerLoading && (
                  <div
                    style={{
                      padding: "18px 0",
                      color: T.text.muted,
                      fontSize: 13,
                    }}
                  >
                    Checking Windows printers…
                  </div>
                )}

                {printerError && !printerLoading && (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                      padding: 12,
                      borderRadius: T.r.md,
                      background: "rgba(239,68,68,0.10)",
                      border: "1px solid rgba(239,68,68,0.22)",
                      color: "#fca5a5",
                      fontSize: 13,
                    }}
                  >
                    <AlertCircle size={16} />
                    <span>{printerError}</span>
                  </div>
                )}

                {!printerLoading && !printerError && printers.length === 0 && (
                  <div
                    style={{
                      padding: "18px 0",
                      color: T.text.muted,
                      fontSize: 13,
                    }}
                  >
                    No printers detected yet.
                  </div>
                )}

                {!printerLoading && printers.length > 0 && (
                  <div>
                    {printers.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          padding: "14px 0",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <IconChip
                          icon={<PrinterIcon2 size={18} />}
                          theme="green"
                        />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>
                            {p.displayName}{" "}
                            {p.isDefault && (
                              <Badge label="Default" color="green" />
                            )}
                          </div>

                          <div
                            style={{
                              marginTop: 5,
                              fontSize: 12,
                              color: T.text.muted,
                            }}
                          >
                            {p.model} · {p.connection} ·{" "}
                            {p.status || "Unknown status"}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "4px 12px",
                              marginTop: 6,
                              fontSize: 11,
                              color: T.text.muted,
                            }}
                          >
                            {p.portName && <span>Port: {p.portName}</span>}
                            {p.hostAddress && <span>IP: {p.hostAddress}</span>}
                            {p.protocol && <span>Protocol: {p.protocol}</span>}
                            {p.portNumber && (
                              <span>Port number: {p.portNumber}</span>
                            )}
                            {p.computerName && (
                              <span>Computer: {p.computerName}</span>
                            )}
                          </div>
                        </div>

                        <Badge
                          label={p.connection}
                          color={p.connection === "USB" ? "blue" : "green"}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {printers.length > 0 && (
                  <div
                    style={{
                      marginTop: 16,
                      paddingTop: 12,
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      fontSize: 11,
                      color: T.text.muted,
                    }}
                  >
                    <CheckCircle2 size={13} color={G.accent} />
                    {printers.length} printer
                    {printers.length === 1 ? "" : "s"} detected on this Windows
                    PC
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* SCANNER / QR POSTER */}
          {settingsTab === "scanner" && (
            <div className="penter d3">
              <Card>
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: T.text.muted,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    QR Poster Generator
                  </div>

                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    Create your shop QR poster
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: T.text.muted,
                      marginTop: 5,
                      lineHeight: 1.5,
                    }}
                  >
                    Create a premium QR poster for customers to scan and open
                    your customer portal.
                  </div>
                </div>

                {/* POSTER DETAILS */}
                <div
                  style={{
                    padding: 16,
                    borderRadius: T.r.lg,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: T.text.muted,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: 14,
                    }}
                  >
                    Poster Details
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <Input
                      label="Shop Name"
                      value={shopName}
                      onChange={setShopName}
                      theme="green"
                    />

                    <Input
                      label="WhatsApp Number"
                      value={whatsapp}
                      onChange={setWhatsapp}
                      theme="green"
                    />

                    <Input
                      label="Email"
                      value={email}
                      onChange={setEmail}
                      theme="green"
                    />

                    <Input
                      label="Shop Address"
                      value={address}
                      onChange={setAddress}
                      theme="green"
                    />

                    <Input
                      label="Customer Portal URL"
                      value={portalUrl}
                      onChange={setPortalUrl}
                      theme="green"
                    />
                  </div>
                </div>

                {/* POSTER THEME */}
                <div
                  style={{
                    padding: 16,
                    borderRadius: T.r.lg,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: T.text.muted,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: 12,
                    }}
                  >
                    Poster Theme
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2,1fr)",
                      gap: 10,
                    }}
                  >
                    {/* ORANGE + BLACK */}
                    <button
                      type="button"
                      onClick={() => setQrTheme("orange-black")}
                      style={{
                        padding: 12,
                        borderRadius: T.r.md,
                        border:
                          qrTheme === "orange-black"
                            ? "1px solid #ff6a00"
                            : "1px solid rgba(255,255,255,0.08)",
                        background:
                          qrTheme === "orange-black"
                            ? "rgba(255,106,0,0.10)"
                            : "rgba(255,255,255,0.035)",
                        cursor: "pointer",
                        textAlign: "left",
                        color: T.text.primary,
                        fontFamily: "inherit",
                      }}
                    >
                      <div
                        style={{
                          height: 55,
                          borderRadius: 9,
                          background:
                            "linear-gradient(145deg,#050505,#111111 55%,#1b0d05)",
                          border: "1px solid rgba(255,106,0,0.35)",
                          position: "relative",
                          overflow: "hidden",
                          marginBottom: 9,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            width: 70,
                            height: 70,
                            borderRadius: "50%",
                            background: "#ff6a00",
                            filter: "blur(25px)",
                            opacity: 0.45,
                            right: 0,
                            top: -20,
                          }}
                        />
                      </div>

                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        Orange + Black
                      </div>

                      <div
                        style={{
                          fontSize: 10,
                          color: T.text.muted,
                          marginTop: 3,
                        }}
                      >
                        Dark customer-page style
                      </div>
                    </button>

                    {/* ORANGE + WHITE */}
                    <button
                      type="button"
                      onClick={() => setQrTheme("orange-white")}
                      style={{
                        padding: 12,
                        borderRadius: T.r.md,
                        border:
                          qrTheme === "orange-white"
                            ? "1px solid #ff6a00"
                            : "1px solid rgba(255,255,255,0.08)",
                        background:
                          qrTheme === "orange-white"
                            ? "rgba(255,106,0,0.10)"
                            : "rgba(255,255,255,0.035)",
                        cursor: "pointer",
                        textAlign: "left",
                        color: T.text.primary,
                        fontFamily: "inherit",
                      }}
                    >
                      <div
                        style={{
                          height: 55,
                          borderRadius: 9,
                          background:
                            "linear-gradient(145deg,#ffffff,#fff8f2 55%,#fff0e4)",
                          border: "1px solid rgba(255,106,0,0.35)",
                          position: "relative",
                          overflow: "hidden",
                          marginBottom: 9,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            width: 70,
                            height: 70,
                            borderRadius: "50%",
                            background: "#ff6a00",
                            filter: "blur(25px)",
                            opacity: 0.28,
                            right: 0,
                            top: -20,
                          }}
                        />
                      </div>

                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        Orange + White
                      </div>

                      <div
                        style={{
                          fontSize: 10,
                          color: T.text.muted,
                          marginTop: 3,
                        }}
                      >
                        Light customer-page style
                      </div>
                    </button>
                  </div>
                </div>

                {/* ACTIONS */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    marginBottom: 20,
                  }}
                >
                  <Btn
                    onClick={generatePoster}
                    theme="green"
                    icon={<QrCode size={15} />}
                  >
                    Generate QR Poster
                  </Btn>

                  {qrGenerated && (
                    <>
                      <Btn
                        variant="secondary"
                        theme="green"
                        icon={<Download size={15} />}
                        onClick={downloadPoster}
                      >
                        Download Poster
                      </Btn>

                      <Btn
                        variant="secondary"
                        theme="green"
                        icon={<PrinterIcon size={15} />}
                        onClick={printPoster}
                      >
                        Print Poster
                      </Btn>
                    </>
                  )}
                </div>

                {/* POSTER PREVIEW */}
                {qrGenerated && (
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: T.text.muted,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        marginBottom: 10,
                      }}
                    >
                      Poster Preview
                    </div>

                    <div
                      ref={posterRef}
                      className="qr-poster-print"
                      style={{
                        width: "100%",
                        maxWidth: 520,
                        aspectRatio: "210 / 297",
                        margin: "0 auto",
                        position: "relative",
                        overflow: "hidden",
                        borderRadius: 16,
                        background:
                          qrTheme === "orange-black"
                            ? "linear-gradient(145deg,#050505,#111111 55%,#1b0d05)"
                            : "linear-gradient(145deg,#ffffff,#fff8f2 55%,#fff0e4)",
                        border:
                          qrTheme === "orange-black"
                            ? "1px solid rgba(255,106,0,0.35)"
                            : "1px solid rgba(255,106,0,0.30)",
                        boxShadow:
                          qrTheme === "orange-black"
                            ? "0 25px 70px rgba(0,0,0,0.55), 0 0 45px rgba(255,106,0,0.10)"
                            : "0 25px 70px rgba(0,0,0,0.25), 0 0 45px rgba(255,106,0,0.10)",
                        padding: 28,
                        boxSizing: "border-box",
                        color:
                          qrTheme === "orange-black" ? "#ffffff" : "#111111",
                        fontFamily: "inherit",
                      }}
                    >
                      {/* ORANGE GLOW */}
                      <div
                        style={{
                          position: "absolute",
                          width: 180,
                          height: 180,
                          borderRadius: "50%",
                          background: "#ff6a00",
                          filter: "blur(80px)",
                          opacity: 0.14,
                          top: -70,
                          right: -50,
                          pointerEvents: "none",
                        }}
                      />

                      {/* BRAND */}
                      <div
                        style={{
                          position: "relative",
                          textAlign: "center",
                          marginBottom: 22,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 24,
                            fontWeight: 850,
                            letterSpacing: "-0.04em",
                          }}
                        >
                          <span style={{ color: "#ff6a00" }}>
                            {shopName || "Inkory"}
                          </span>
                        </div>
                      </div>

                      {/* HEADLINE */}
                      <div
                        style={{
                          position: "relative",
                          textAlign: "center",
                          marginBottom: 18,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 34,
                            lineHeight: 0.98,
                            fontWeight: 900,
                            letterSpacing: "-0.05em",
                          }}
                        >
                          PRINT SMART.
                        </div>

                        <div
                          style={{
                            fontSize: 34,
                            lineHeight: 0.98,
                            fontWeight: 900,
                            letterSpacing: "-0.05em",
                            color: "#ff6a00",
                            marginTop: 4,
                          }}
                        >
                          SCAN & SEND.
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            lineHeight: 1.5,
                            marginTop: 12,
                            color:
                              qrTheme === "orange-black"
                                ? "rgba(255,255,255,0.65)"
                                : "rgba(0,0,0,0.65)",
                          }}
                        >
                          Scan the QR code to upload your documents
                          <br />
                          and place your print order.
                        </div>
                      </div>

                      {/* QR GLASS CARD */}
                      <div
                        style={{
                          position: "relative",
                          width: "72%",
                          margin: "0 auto",
                          padding: 14,
                          borderRadius: 18,
                          background:
                            qrTheme === "orange-black"
                              ? "rgba(255,255,255,0.07)"
                              : "rgba(255,255,255,0.62)",
                          border:
                            qrTheme === "orange-black"
                              ? "1px solid rgba(255,255,255,0.12)"
                              : "1px solid rgba(255,106,0,0.20)",
                          boxShadow:
                            qrTheme === "orange-black"
                              ? "inset 0 1px 0 rgba(255,255,255,0.08)"
                              : "0 12px 35px rgba(0,0,0,0.10)",
                          backdropFilter: "blur(14px)",
                          WebkitBackdropFilter: "blur(14px)",
                        }}
                      >
                        <div
                          style={{
                            background: "#ffffff",
                            borderRadius: 12,
                            padding: 10,
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <img
                            src={qrImgUrl}
                            alt="Customer Portal QR"
                            crossOrigin="anonymous"
                            style={{
                              width: "100%",
                              maxWidth: 220,
                              display: "block",
                            }}
                          />
                        </div>
                      </div>

                      {/* CTA */}
                      <div
                        style={{
                          position: "relative",
                          width: "62%",
                          margin: "14px auto 18px",
                          padding: "11px 14px",
                          borderRadius: 12,
                          textAlign: "center",
                          background: "#ff6a00",
                          color: "#ffffff",
                          fontSize: 13,
                          fontWeight: 800,
                          letterSpacing: "0.02em",
                          boxShadow: "0 8px 25px rgba(255,106,0,0.28)",
                        }}
                      >
                        SCAN TO START
                      </div>

                      {/* SHOP INFO */}
                      <div
                        style={{
                          position: "relative",
                          padding: "14px 16px",
                          borderRadius: 14,
                          background:
                            qrTheme === "orange-black"
                              ? "rgba(255,255,255,0.055)"
                              : "rgba(255,255,255,0.55)",
                          border:
                            qrTheme === "orange-black"
                              ? "1px solid rgba(255,255,255,0.10)"
                              : "1px solid rgba(255,106,0,0.18)",
                          backdropFilter: "blur(12px)",
                          WebkitBackdropFilter: "blur(12px)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 800,
                            marginBottom: 4,
                          }}
                        >
                          {shopName || "Inkory"}
                        </div>

                        <div
                          style={{
                            fontSize: 9,
                            color: "#ff6a00",
                            fontWeight: 700,
                            marginBottom: 8,
                          }}
                        >
                          PRINT • SCAN • LAMINATION • PASSPORT PHOTOS
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            fontSize: 9,
                            color:
                              qrTheme === "orange-black"
                                ? "rgba(255,255,255,0.62)"
                                : "rgba(0,0,0,0.62)",
                          }}
                        >
                          {whatsapp && <div>WhatsApp: {whatsapp}</div>}
                          {email && <div>Email: {email}</div>}
                          {address && <div>Address: {address}</div>}
                        </div>
                      </div>

                      {/* FOOTER — NO Inkory */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: 16,
                          left: 0,
                          right: 0,
                          textAlign: "center",
                          fontSize: 9,
                          color:
                            qrTheme === "orange-black"
                              ? "rgba(255,255,255,0.45)"
                              : "rgba(0,0,0,0.45)",
                          fontWeight: 700,
                        }}
                      >
                        {shopName || "Inkory"}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── File Editor Component integrated from FileEditorWorkspace.tsx ─────

// ─── Admin root ───────────────────────────────────────────────────────

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [screen, setScreen] = useState<AScreen>("dashboard");
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [previewFile, setPreviewFile] = useState<{
    url: string;
    mimeType: string;
    originalName: string;
    isBw?: boolean;
  } | null>(null);
  const [fileSelectionModal, setFileSelectionModal] = useState<Order | null>(
    null,
  );
  const [fileEditorFile, setFileEditorFile] = useState<{
    file: UploadedFile;
    order: Order;
  } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Auto-collapse on laptop/smaller screens (<1024px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let disposed = false;

    const refreshOrders = async () => {
      try {
        const latestOrders = await adminApi.getOrders();
        if (disposed) return;

        setOrders(latestOrders);
        setSelectedOrder((current) => {
          if (!current) return current;
          return latestOrders.find((order) => order.id === current.id) ?? null;
        });
      } catch (error) {
        console.error("Automatic orders refresh error:", error);
      }
    };

    refreshOrders();
    const refreshTimer = window.setInterval(refreshOrders, 5000);

    return () => {
      disposed = true;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const pendingCount = orders.filter((o) => o.status === "received").length;

  const updateOrder = (updated: Order) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    setSelectedOrder(updated);
  };

  const openOrder = (o: Order) => {
    setSelectedOrder(o);
    setScreen("order-detail");
  };

  const handleOpenFile = (order: Order) => {
    if (order.uploadedFiles && order.uploadedFiles.length > 0) {
      if (order.uploadedFiles.length === 1) {
        const file = order.uploadedFiles[0];
        setPreviewFile({
          url: getUploadedFilePreviewUrl(file.storedName, file.mimeType),
          mimeType: file.mimeType,
          originalName: file.originalName,
          isBw: order.color === "bw",
        });
      } else {
        setFileSelectionModal(order);
      }
    } else {
      alert("No uploaded files are available for this order.");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        maxHeight: "100vh",
        width: "100vw",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <AdminBg />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          width: "100%",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <Sidebar
          screen={screen}
          setScreen={setScreen}
          onLogout={onLogout}
          pendingCount={pendingCount}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            height: "100vh",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {screen === "dashboard" && (
            <DashboardScreen
              orders={orders}
              setScreen={setScreen}
              setSelectedOrder={setSelectedOrder}
            />
          )}
          {screen === "orders" && (
            <OrdersScreen
              orders={orders}
              setScreen={setScreen}
              setSelectedOrder={setSelectedOrder}
              onOrdersDeleted={(updatedOrders) => setOrders(updatedOrders)}
            />
          )}
          {screen === "order-detail" && selectedOrder && (
            <OrderDetailScreen
              order={selectedOrder}

              onBack={() => setScreen("orders")}
              onUpdate={updateOrder}
              onPreviewFile={(url, mime, name, isBw) =>
                setPreviewFile({
                  url,
                  mimeType: mime,
                  originalName: name,
                  isBw,
                })
              }
              onOpenFileEditor={(file) => {
                if (!selectedOrder) return;
                setFileEditorFile({ file, order: selectedOrder });

                setScreen("file-editor");
              }}
            />
          )}
          {screen === "file-editor" && fileEditorFile && (
            <FileEditorWorkspace
              file={fileEditorFile.file}
              order={fileEditorFile.order}
              onBack={() => setScreen("order-detail")}
              onSaveSuccess={() => {
                adminApi.getOrders().then(setOrders);
              }}
            />
          )}
          {screen === "queue" && (
            <QueueScreen orders={orders} onOpenFile={handleOpenFile} />
          )}
          {screen === "ledger" && <LedgerScreen orders={orders} />}
          {screen === "reports" && <ReportsScreen orders={orders} />}
          {screen === "storage" && <StorageScreen />}
          {screen === "settings" && <SettingsScreen />}
        </div>
      </div>

      {fileSelectionModal && (
        <Modal
          open={!!fileSelectionModal}
          onClose={() => setFileSelectionModal(null)}
          title="Select File to Open"
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: "10px 0",
            }}
          >
            {fileSelectionModal.uploadedFiles &&
            fileSelectionModal.uploadedFiles.length > 0
              ? fileSelectionModal.uploadedFiles.map((file, i) => (
                  <div
                    key={file.id || i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: T.r.md,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: T.text.primary,
                        }}
                        title={file.originalName}
                      >
                        {file.originalName}
                      </div>
                      <div style={{ fontSize: 11, color: T.text.muted }}>
                        {formatFileSize(file.size)} · {file.mimeType}{file.pages ? ` · ${file.pages} pages` : ''} · {file.copies || 1} {file.copies === 1 ? 'copy' : 'copies'}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setPreviewFile({
                          url: getUploadedFilePreviewUrl(file.storedName, file.mimeType),
                          mimeType: file.mimeType,
                          originalName: file.originalName,
                          isBw: fileSelectionModal.color === "bw",
                        });
                        setFileSelectionModal(null);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "6px 12px",
                        borderRadius: T.r.md,
                        background: G.accent,
                        border: "none",
                        cursor: "pointer",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      <Eye size={13} /> Open
                    </button>
                  </div>
                ))
              : Array.from({ length: fileSelectionModal.files }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: T.r.md,
                    }}
                  >
                    <span style={{ fontSize: 13, color: T.text.secondary }}>
                      {fileSelectionModal.service === "passport"
                        ? `photo_${i + 1}`
                        : `document_${i + 1}`}
                    </span>
                    <span style={{ fontSize: 11, color: T.text.muted }}>
                      Not uploaded
                    </span>
                  </div>
                ))}
          </div>
        </Modal>
      )}

      {previewFile && (
        <Modal
          open={!!previewFile}
          onClose={() => setPreviewFile(null)}
          title={previewFile.originalName}
          width={800}
        >
          <div
            style={{
              width: "100%",
              height: "70vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#111",
              borderRadius: T.r.md,
              overflow: "hidden",
              position: "relative",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {previewFile.mimeType.startsWith("image/") ? (
              <img
                src={previewFile.url}
                alt={previewFile.originalName}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  filter: previewFile.isBw ? "grayscale(100%)" : "none",
                }}
              />
            ) : (
              <iframe
                src={previewFile.url}
                title={previewFile.originalName}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  background: "#fff",
                  filter: previewFile.isBw ? "grayscale(100%)" : "none",
                }}
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function AdminWithLogin() {
  const { isAuthed, login, logout } = useAdminSession();
  return isAuthed ? (
    <AdminDashboard onLogout={logout} />
  ) : (
    <LoginScreen onLogin={login} />
  );
}
