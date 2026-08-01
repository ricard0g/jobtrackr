import * as React from "react";
import { Toast as ToastPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function ToastProvider({
    ...props
}: React.ComponentProps<typeof ToastPrimitive.Provider>) {
    return <ToastPrimitive.Provider data-slot="toast-provider" {...props} />;
}

function Toast({
    className,
    ...props
}: React.ComponentProps<typeof ToastPrimitive.Root>) {
    return (
        <ToastPrimitive.Root
            data-slot="toast"
            className={cn(
                "grid gap-1 rounded-lg border border-red-200 bg-white px-4 py-3 text-dark-gray shadow-cool-strong",
                className,
            )}
            {...props}
        />
    );
}

function ToastTitle({
    className,
    ...props
}: React.ComponentProps<typeof ToastPrimitive.Title>) {
    return (
        <ToastPrimitive.Title
            data-slot="toast-title"
            className={cn("font-display text-sm font-semibold", className)}
            {...props}
        />
    );
}

function ToastDescription({
    className,
    ...props
}: React.ComponentProps<typeof ToastPrimitive.Description>) {
    return (
        <ToastPrimitive.Description
            data-slot="toast-description"
            className={cn("text-sm text-medium-gray", className)}
            {...props}
        />
    );
}

function ToastViewport({
    className,
    ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
    return (
        <ToastPrimitive.Viewport
            data-slot="toast-viewport"
            className={cn(
                "fixed top-4 right-4 z-[100] flex max-h-screen w-[calc(100%-2rem)] max-w-sm flex-col gap-2 outline-none",
                className,
            )}
            {...props}
        />
    );
}

export {
    Toast,
    ToastDescription,
    ToastProvider,
    ToastTitle,
    ToastViewport,
};
