(function initialiserConfigurationMPP(global) {
  "use strict";

  global.MPP_CONFIG = Object.freeze({
    version: "Alpha 0.13.0.2 - Security & Reliability",
    supabaseUrl: "https://icguokxqrnqdjafqvzyz.supabase.co",
    supabasePublishableKey: "sb_publishable_Twp9mcx7CQdS_weNNUPtTQ_8V1s_Z_R",
    playerSessionStorageKey: "mpp_player_session_v1",
    savedPseudoKey: "mpp_saved_pseudo",
    rpcTimeoutMs: 12 * 1000,
    edgeTimeoutMs: 12 * 1000,
    adminIdleWarningMs: 12 * 60 * 1000,
    adminIdleTimeoutMs: 15 * 60 * 1000
  });
})(window);
