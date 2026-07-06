import * as React from "react";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

function Form({ ...props }: React.ComponentProps<"form">) {
	return <form data-slot="form" {...props} />;
}

function FormField({
	className,
	name,
	...props
}: React.ComponentProps<"div"> & { name?: string }) {
	return (
		<div
			data-slot="form-field"
			data-field-name={name}
			className={cn("grid gap-2", className)}
			{...props}
		/>
	);
}

function FormLabel({
	className,
	...props
}: React.ComponentProps<"label">) {
	return (
		<label
			data-slot="form-label"
			className={cn("text-sm font-medium", className)}
			{...props}
		/>
	);
}

function FormControl({
	asChild = false,
	...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
	const Comp = asChild ? Slot.Root : "div";

	return <Comp data-slot="form-control" {...props} />;
}

function FormMessage({
	className,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="form-message"
			className={cn("text-sm text-destructive", className)}
			{...props}
		/>
	);
}

export { Form, FormControl, FormField, FormLabel, FormMessage };
