import defaultLogo from "./assets/sgpea-logo.png";
import kidCastleLogo1 from "./assets/kid-castle-logo-1.jpg";
import kidCastleLogo2 from "./assets/kid-castle-logo-2.jpg";

/**
 * 預設協會 Logo
 */
export const DEFAULT_LOGO = defaultLogo;

/**
 * 吉的堡專用 Logo
 * 如果要切換為第二版，只需把這裡改為 kidCastleLogo2 即可。
 */
export const ACTIVE_KID_CASTLE_LOGO = kidCastleLogo1;

/**
 * 根據學校名稱取得對應的 Logo
 */
export function getSchoolLogo(schoolNameSnapshot?: string): string {
  if (schoolNameSnapshot && schoolNameSnapshot.includes("吉的堡")) {
    return ACTIVE_KID_CASTLE_LOGO;
  }
  return DEFAULT_LOGO;
}
