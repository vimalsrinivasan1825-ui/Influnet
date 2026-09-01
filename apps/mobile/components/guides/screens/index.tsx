import type { ScreenId } from '@influnet/core';
import { IgEdit, IgProfile, InfVerify, PhoneHome } from './instagram';
import { InfChat, InfDiscover, InfHome, InfMessages } from './influnet-core';
import { InfPayment, InfProjects, InfRequest, InfStage } from './influnet-deals';
import {
  InfAccountMenu,
  InfActivity,
  InfBilling,
  InfProfileEditor,
  InfPublicProfile,
  InfSupport,
} from './influnet-account';
import type { GuideContext } from './kit';

export type { GuideContext } from './kit';
export { DEFAULT_CONTEXT } from './kit';

const MAP: Record<ScreenId, (props: { ctx: GuideContext }) => React.ReactNode> = {
  'phone-home': PhoneHome,
  'ig-profile': IgProfile,
  'ig-edit': IgEdit,
  'inf-verify': InfVerify,
  'inf-home': InfHome,
  'inf-discover': InfDiscover,
  'inf-profile-editor': InfProfileEditor,
  'inf-public-profile': InfPublicProfile,
  'inf-messages': InfMessages,
  'inf-chat': InfChat,
  'inf-request': InfRequest,
  'inf-projects': InfProjects,
  'inf-stage': InfStage,
  'inf-payment': InfPayment,
  'inf-account-menu': InfAccountMenu,
  'inf-billing': InfBilling,
  'inf-activity': InfActivity,
  'inf-support': InfSupport,
};

export function GuideScreen({ id, ctx }: { id: ScreenId; ctx: GuideContext }) {
  const Screen = MAP[id];
  return <Screen ctx={ctx} />;
}
