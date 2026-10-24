// Where the live world's guest sign-in lives. Both values are PUBLIC (the project URL and its publishable key); no secret belongs here.
// The key is the project's PUBLISHABLE key (public by design; never the legacy anon JWT, never a secret). Anonymous sign-ins must
// also be enabled on the project, otherwise the guest signup is refused and the live world stays offline.
export const WORLD_AUTH = {
  url: "https://fdbqnupceqytizxnoiua.supabase.co",
  anonKey: "sb_publishable_lrqe_EIp22G8SbUwhwYzsQ_oKAbYROI",
};
