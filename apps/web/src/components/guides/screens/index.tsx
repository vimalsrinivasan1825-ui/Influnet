"use client";

/**
 * ScreenId → mock-screen component. The player mounts only the screens a given
 * script lists (`screensOf(script)`).
 */

import type { ScreenId } from "@influnet/core";
import type { GuideContext } from "./kit";
import { PhoneHome, IgProfile, IgEdit, InfVerify } from "./instagram";
import { InfHome, InfDiscover, InfMessages, InfChat } from "./influnet-core";
import { InfRequest, InfProjects, InfStage, InfPayment } from "./influnet-deals";
import {
  InfProfileEditor,
  InfPublicProfile,
  InfAccountMenu,
  InfBilling,
  InfActivity,
  InfSupport,
} from "./influnet-account";

export type { GuideContext } from "./kit";
export { DEFAULT_CONTEXT } from "./kit";

type ScreenComponent = (props: { ctx: GuideContext }) => React.ReactNode;

export const SCREENS: Record<ScreenId, ScreenComponent> = {
  "phone-home": PhoneHome,
  "ig-profile": IgProfile,
  "ig-edit": IgEdit,
  "inf-verify": InfVerify,
  "inf-home": InfHome,
  "inf-discover": InfDiscover,
  "inf-profile-editor": InfProfileEditor,
  "inf-public-profile": InfPublicProfile,
  "inf-messages": InfMessages,
  "inf-chat": InfChat,
  "inf-request": InfRequest,
  "inf-projects": InfProjects,
  "inf-stage": InfStage,
  "inf-payment": InfPayment,
  "inf-account-menu": InfAccountMenu,
  "inf-billing": InfBilling,
  "inf-activity": InfActivity,
  "inf-support": InfSupport,
};
