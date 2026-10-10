export function playerCardEnabled() { return process.env.PLAYER_CARD_ENABLED === "true"; }
export function playerCardPreviewEnabled() { return process.env.NODE_ENV !== "production" && playerCardEnabled() && process.env.PLAYER_CARD_PREVIEW === "true"; }
