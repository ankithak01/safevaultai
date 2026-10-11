import { ShieldCheck } from "lucide-react";

export function Logo({ invert }: { invert?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${invert ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-primary text-primary-foreground"}`}>
        <ShieldCheck className="h-5 w-5" />
      </div>
      <span className={`text-lg font-bold ${invert ? "text-sidebar-accent-foreground" : "text-primary"}`}>SafeVault</span>
    </div>
  );
}
