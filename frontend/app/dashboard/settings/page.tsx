"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { Settings, Bell, Palette, Sun, Moon, Monitor, Check } from "lucide-react";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const NOTIFICATIONS_KEY = "fluxid-notifications";

interface NotificationPreferences {
  scoreAlerts: boolean;
  transactionAlerts: boolean;
  weeklyReports: boolean;
}

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  scoreAlerts: true,
  transactionAlerts: true,
  weeklyReports: false,
};

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<NotificationPreferences>(DEFAULT_NOTIFICATIONS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(NOTIFICATIONS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<NotificationPreferences>;
        setNotifications((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // use defaults
    }
  }, []);

  const handleNotificationChange = (key: keyof NotificationPreferences, value: boolean) => {
    setNotifications((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    try {
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
      if (theme) {
        setTheme(theme);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // storage may be unavailable
    }
  };

  if (!mounted) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-[var(--surface)] rounded-lg" />
        <div className="h-32 bg-[var(--surface)] rounded-xl" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="pb-28 lg:pb-32"
    >
        {/* Page Header */}
        <div className="flex items-center gap-3 mb-8">
          <div 
            style={{ background: "var(--primary-muted)" }}
            className="flex h-10 w-10 items-center justify-center rounded-lg"
          >
            <Settings className="h-5 w-5" style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <h1 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 28 }} className="mb-1">
              Settings
            </h1>
            <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
              Manage your preferences and account settings
            </p>
          </div>
        </div>

        {/* Theme Selection */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-6">
            <Palette size={18} style={{ color: "var(--primary)" }} />
            <h2 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 16 }}>
              Appearance
            </h2>
          </div>
          
          <p style={{ color: "var(--foreground-muted)", fontSize: 13, marginBottom: 16 }}>
            Choose your preferred theme
          </p>
          
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                style={{
                  background: theme === value ? "var(--primary)" : "var(--surface)",
                  border: `1px solid ${theme === value ? "var(--primary)" : "var(--border)"}`,
                  borderRadius: 12,
                  padding: 16,
                }}
                className="flex flex-col items-center gap-2 transition-all"
              >
                <Icon 
                  size={20} 
                  style={{ color: theme === value ? "var(--background)" : "var(--foreground-muted)" }} 
                />
                <span 
                  style={{ 
                    color: theme === value ? "var(--background)" : "var(--foreground)",
                    fontSize: 14,
                    fontWeight: 600
                  }}
                >
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-6">
            <Bell size={18} style={{ color: "var(--primary)" }} />
            <h2 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 16 }}>
              Notifications
            </h2>
          </div>

          <div className="space-y-4">
            <NotificationRow
              label="Score Alerts"
              description="Get notified when your liquidity score changes significantly."
              checked={notifications.scoreAlerts}
              onCheckedChange={(val) => handleNotificationChange("scoreAlerts", val)}
            />
            <div style={{ background: "var(--border)", height: 1 }} />
            
            <NotificationRow
              label="Transaction Alerts"
              description="Be notified when transactions are detected for analyzed wallets."
              checked={notifications.transactionAlerts}
              onCheckedChange={(val) => handleNotificationChange("transactionAlerts", val)}
            />
            <div style={{ background: "var(--border)", height: 1 }} />
            
            <NotificationRow
              label="Weekly Reports"
              description="Receive a weekly summary of wallet analysis activity."
              checked={notifications.weeklyReports}
              onCheckedChange={(val) => handleNotificationChange("weeklyReports", val)}
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="btn btn-primary flex items-center gap-2 px-6"
          >
            {saved ? (
              <>
                <Check size={16} />
                Saved
              </>
            ) : (
              <>
                <Settings size={16} />
                Save Changes
              </>
            )}
          </button>
        </div>
    </motion.div>
  );
}

function NotificationRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="space-y-0.5 min-w-0">
        <p style={{ color: "var(--foreground)", fontSize: 14, fontWeight: 600 }}>{label}</p>
        <p style={{ color: "var(--foreground-muted)", fontSize: 12 }}>{description}</p>
      </div>
      <button
        onClick={() => onCheckedChange(!checked)}
        className={`shrink-0 w-12 h-6 rounded-full flex items-center transition-colors ${checked ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
      >
        <div
          className={`w-5 h-5 bg-white rounded-full transition-transform ${checked ? "translate-x-6" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}
