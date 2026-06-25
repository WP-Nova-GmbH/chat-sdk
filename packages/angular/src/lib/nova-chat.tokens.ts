import { InjectionToken } from "@angular/core";
import type { SdkConfig } from "@wp-nova/sdk";

export const NOVA_CHAT_CONFIG = new InjectionToken<SdkConfig>("NOVA_CHAT_CONFIG");
