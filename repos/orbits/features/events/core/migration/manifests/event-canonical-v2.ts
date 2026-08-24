import type {
  EventCanonicalConflictResolution,
  EventCanonicalResolutionField,
  EventCanonicalResolutionManifest,
} from "../contract";

interface ResolutionDefinition {
  eventId: string;
  field: EventCanonicalResolutionField;
  legacyDigest: string;
  publicDigest: string;
}

const definitions = [
  { eventId: "event_01", field: "title", publicDigest: "0aec0cc5f4545ea8dfa08b5203a0424eae9c40edff708a16c1f9c702f3881a9a", legacyDigest: "a300036b28b1cc518968987d5f67a70d85814c3fc2027fbe19838ef3cb66fe47" },
  { eventId: "event_01", field: "venue", publicDigest: "964f7b65eae43b30cab64d74f2059e94207448175f39f1d3c4fb8b4bd7b31e21", legacyDigest: "dafe443bc2d0ff48e48e8745a79347dbf38754c28f9cdda831c745375104173d" },
  { eventId: "event_02", field: "title", publicDigest: "65b84568fe39c7a34f7646c4cfffa298455055c16bbded23f435c888067fabc3", legacyDigest: "f3fc340caa6b665c3c0c766906b75e9157ff16295d4bf01dcdd1bccd745c6aa1" },
  { eventId: "event_02", field: "venue", publicDigest: "89a772bd9a255529d288130acdd221fe19dc8481f4330f7e493296062025412a", legacyDigest: "66c9bf88f18725517d98c3d73a534cd1aeff5fc3930c50e05fcab426bcc928a6" },
  { eventId: "event_03", field: "title", publicDigest: "1239333e730d724bc132ef978d340055a500896187ed5006982ae06f76b049aa", legacyDigest: "089c3699067e77b0d8a0b2ee970441e21d90c098e58026763a942aeb0a1b2877" },
  { eventId: "event_03", field: "venue", publicDigest: "ad3afd2c46db236d3124f8cac49fd2fda48d6afebe1235625ba069b80284e281", legacyDigest: "9f18f191a5114f56f107f8c2d32bff7f59d71c34253e98f6b6cfbc94722de6cb" },
  { eventId: "event_04", field: "title", publicDigest: "9b913d685058719d0375e2a85147bd97651d96fa6c147169dd35217aea3aa4f0", legacyDigest: "4f3d30b15c2b82302ce20aae2e089212292791fae7194a7736c9d35343fde9aa" },
  { eventId: "event_04", field: "venue", publicDigest: "ced6dcf88f26881d5caba5499e064ea5adcfe07aacb49a28907c143c5e65baf7", legacyDigest: "91145e4530b86647cf822f414dddf5a16e98d5985a5ec7c4ebe5ea0ada336298" },
  { eventId: "event_05", field: "title", publicDigest: "b9ecbc33865694de3a43bf5ae0db946b94b37571b262ab9145d5146a9784ee7d", legacyDigest: "fdbc75a6bd70c8130ef7ec08e660b07d2c1fbb875c8920395d724a5261a00213" },
  { eventId: "event_05", field: "venue", publicDigest: "964f7b65eae43b30cab64d74f2059e94207448175f39f1d3c4fb8b4bd7b31e21", legacyDigest: "dafe443bc2d0ff48e48e8745a79347dbf38754c28f9cdda831c745375104173d" },
  { eventId: "event_06", field: "title", publicDigest: "5e8874d026cc48cefc2fce429e5fdd5168db52aefca8058afcb2bca8d51b47a1", legacyDigest: "b13346ce07d8ae83aea6cd1124239b5f4a231e473151ba6b141d675b903ba373" },
  { eventId: "event_06", field: "venue", publicDigest: "89a772bd9a255529d288130acdd221fe19dc8481f4330f7e493296062025412a", legacyDigest: "66c9bf88f18725517d98c3d73a534cd1aeff5fc3930c50e05fcab426bcc928a6" },
  { eventId: "event_07", field: "title", publicDigest: "a3903de62b44304bc8f3c6614d9523ee32241bf12ae0bb853b86ba8ecd9b93c0", legacyDigest: "08bd9dd1510de715091baee00c8de54bd78795ad080ad61f82af43c673596a24" },
  { eventId: "event_07", field: "venue", publicDigest: "ad3afd2c46db236d3124f8cac49fd2fda48d6afebe1235625ba069b80284e281", legacyDigest: "9f18f191a5114f56f107f8c2d32bff7f59d71c34253e98f6b6cfbc94722de6cb" },
  { eventId: "event_08", field: "title", publicDigest: "1fa336750f60962cfde5c5e492734422df7a6579c4ba4ec745986c9244e7c40c", legacyDigest: "e4a5476c8b6596837d32a3219d9db93ecaeed2607a53894fed48858de84e776b" },
  { eventId: "event_08", field: "venue", publicDigest: "ced6dcf88f26881d5caba5499e064ea5adcfe07aacb49a28907c143c5e65baf7", legacyDigest: "91145e4530b86647cf822f414dddf5a16e98d5985a5ec7c4ebe5ea0ada336298" },
  { eventId: "event_09", field: "title", publicDigest: "fe000bcf21c581d3d4df1f5296c70ae60ed64aa06c88b9fd6e586e5f4668b314", legacyDigest: "83a553ec73899a075ca749cd6485e62802b86539d41a0e34bfffbe46645e805c" },
  { eventId: "event_09", field: "venue", publicDigest: "964f7b65eae43b30cab64d74f2059e94207448175f39f1d3c4fb8b4bd7b31e21", legacyDigest: "dafe443bc2d0ff48e48e8745a79347dbf38754c28f9cdda831c745375104173d" },
  { eventId: "event_10", field: "title", publicDigest: "724cc3cb3c516d8100216baf53b4ee539c4156c9c118823dbbb9eef8979370a7", legacyDigest: "72f50b1184df8163e88e646ef216d2b1b4f49d6d017cf8ac1ea6c904f122d9a9" },
  { eventId: "event_10", field: "venue", publicDigest: "89a772bd9a255529d288130acdd221fe19dc8481f4330f7e493296062025412a", legacyDigest: "66c9bf88f18725517d98c3d73a534cd1aeff5fc3930c50e05fcab426bcc928a6" },
  { eventId: "event_signup_01", field: "title", publicDigest: "0c6eab40e35343a20354b12ed267855446f88da3a7ecfd3faf95c699c2f0d66b", legacyDigest: "52dc133c942c02c17a9dfdb090fd4669b59ccc3ea49ac4076bdb4162819b5e1a" },
  { eventId: "event_signup_01", field: "venue", publicDigest: "964f7b65eae43b30cab64d74f2059e94207448175f39f1d3c4fb8b4bd7b31e21", legacyDigest: "dafe443bc2d0ff48e48e8745a79347dbf38754c28f9cdda831c745375104173d" },
  { eventId: "event_signup_01", field: "startsAt", publicDigest: "fe387f2481d1f28194f1cd90bd7396adc8b670e1ee3ace7cc5b9d3af67c9fa75", legacyDigest: "89dc54e878ed37028b079d8a819bbeeca7f2ee8fd4c66a197e452472950c8559" },
  { eventId: "event_signup_01", field: "endsAt", publicDigest: "597cb82d4c59f910b668633e5644e8bc26b799dcb3d9c4d3bbef1f1d0dacbe23", legacyDigest: "71c5c3c80e8ce98f1739cf4ea5840a78afacf65b6cd481a58e9a98846336dfc2" },
  { eventId: "event_signup_02", field: "title", publicDigest: "7c3fc5803255a0271c533dea4d2f2ffba3f7c1b8b909064296947fe91af2319f", legacyDigest: "0025ee9b24f949e7b0844c042509078100615b5b8347b71975048511d8551781" },
  { eventId: "event_signup_02", field: "venue", publicDigest: "ced6dcf88f26881d5caba5499e064ea5adcfe07aacb49a28907c143c5e65baf7", legacyDigest: "91145e4530b86647cf822f414dddf5a16e98d5985a5ec7c4ebe5ea0ada336298" },
  { eventId: "event_signup_02", field: "startsAt", publicDigest: "aa515ceff28723658e2a9e0688fda1d6af9da611b88b29f209f5a3364d7aefab", legacyDigest: "e904f2ff9add848694b55c89128c4e7a6e05ea957f9f79d639e3e0a7da4c0e4d" },
  { eventId: "event_signup_02", field: "endsAt", publicDigest: "44559aa53f8c7c87cf7ffc765f26ed58cb76632851a3013f78ddf6ada7ca355a", legacyDigest: "e904f2ff9add848694b55c89128c4e7a6e05ea957f9f79d639e3e0a7da4c0e4d" },
  { eventId: "event_signup_03", field: "title", publicDigest: "a738b9140c3c6d2f57d534d5b8b0ca001929a4e5d3794f56001f27e77a67a024", legacyDigest: "c854e30ae3ea18cc28e8510986e5fbc07072d8a0f0ca42745ea6968b8e6ee076" },
  { eventId: "event_signup_03", field: "venue", publicDigest: "ced6dcf88f26881d5caba5499e064ea5adcfe07aacb49a28907c143c5e65baf7", legacyDigest: "91145e4530b86647cf822f414dddf5a16e98d5985a5ec7c4ebe5ea0ada336298" },
  { eventId: "event_signup_03", field: "startsAt", publicDigest: "66aaa79a7ce21ae75494b1756cbd6d66c77e4b7d60b9c54696dc749c65b73378", legacyDigest: "124bdac50f722bc9c53703600eeef1e815eac9bc989fdad5969e6812c4c4a217" },
  { eventId: "event_signup_03", field: "endsAt", publicDigest: "0f481a404127430cc970e5a075090e1919dd0f654501cb09f081246c6143517e", legacyDigest: "124bdac50f722bc9c53703600eeef1e815eac9bc989fdad5969e6812c4c4a217" },
] as const satisfies readonly ResolutionDefinition[];

function reasonFor(field: EventCanonicalResolutionField): {
  rationale: string;
  reasonCode: string;
} {
  if (field === "title") {
    return {
      rationale:
        "The approved public catalogue contains the canonical Chinese product title; the legacy event record contains multilingual fixture text.",
      reasonCode: "PUBLIC_CATALOGUE_LOCALIZED_TITLE",
    };
  }
  if (field === "venue") {
    return {
      rationale:
        "The approved public catalogue contains the canonical localized venue; the legacy event record contains an English fixture label.",
      reasonCode: "PUBLIC_CATALOGUE_LOCALIZED_VENUE",
    };
  }
  return {
    rationale:
      "The approved public catalogue contains the reviewed current event schedule; the legacy event record contains an outdated signup fixture timestamp.",
    reasonCode: "PUBLIC_CATALOGUE_CURRENT_SCHEDULE",
  };
}

const resolutions: EventCanonicalConflictResolution[] = definitions.map(
  (definition) => ({
    eventId: definition.eventId,
    field: definition.field,
    ...reasonFor(definition.field),
    selectedSource: "public_catalogue",
    sourceValueDigests: [
      { source: "public_catalogue", digest: definition.publicDigest },
      { source: "orbit_records/events", digest: definition.legacyDigest },
    ],
  }),
);

if (resolutions.length !== 32) {
  throw new Error("event-canonical-v2 must contain exactly 32 resolutions.");
}

for (const resolution of resolutions) {
  resolution.sourceValueDigests.forEach(Object.freeze);
  Object.freeze(resolution.sourceValueDigests);
  Object.freeze(resolution);
}

export const EVENT_CANONICAL_V2_MANIFEST: EventCanonicalResolutionManifest =
  Object.freeze({
    migrationId: "event-canonical-v2",
    resolutions: Object.freeze(resolutions),
    schemaVersion: 1 as const,
  });
