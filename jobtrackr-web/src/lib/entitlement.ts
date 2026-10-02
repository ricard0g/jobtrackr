import { createContext } from "react";
import type { Entitlement } from "@/lib/api";

export const EntitlementContext = createContext<Entitlement | null>(null);
