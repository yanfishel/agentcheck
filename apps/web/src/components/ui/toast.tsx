"use client";

import { Toast } from "@base-ui/react/toast";
import { createContext, type ReactNode, useContext, useMemo } from "react";

type ToastApi = {
	toast: (title: string, opts?: { tone?: "default" | "fail" }) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

function ToastList() {
	const { toasts } = Toast.useToastManager();
	return (
		<Toast.Viewport className="fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
			{toasts.map((t) => (
				<Toast.Root
					key={t.id}
					toast={t}
					className={`rounded-[10px] border bg-surface px-4 py-3 text-sm shadow-card transition duration-150 data-[ending-style]:translate-y-2 data-[starting-style]:translate-y-2 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 ${
						t.type === "fail" ? "border-fail text-fail" : "border-line"
					}`}
				>
					<Toast.Title />
				</Toast.Root>
			))}
		</Toast.Viewport>
	);
}

function ToastBridge({ children }: { children: ReactNode }) {
	const manager = Toast.useToastManager();
	const api = useMemo<ToastApi>(
		() => ({
			toast: (title, opts) => {
				manager.add({ title, type: opts?.tone ?? "default" });
			},
		}),
		[manager],
	);
	return (
		<ToastContext.Provider value={api}>
			{children}
			<ToastList />
		</ToastContext.Provider>
	);
}

export function ToastProvider({ children }: { children: ReactNode }) {
	return (
		<Toast.Provider timeout={4000}>
			<ToastBridge>{children}</ToastBridge>
		</Toast.Provider>
	);
}

export function useToast(): ToastApi {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
	return ctx;
}
