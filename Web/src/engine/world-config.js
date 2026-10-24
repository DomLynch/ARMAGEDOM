// Where the live world's guest sign-in lives. Both values are PUBLIC (the project URL and its publishable key); no secret belongs here.
// The publishable key is empty until Backend/Lead supply it: with it empty the live world cannot sign in and stays offline.
export const WORLD_AUTH = {
  url: "https://fdbqnupceqytizxnoiua.supabase.co",
  anonKey: "",
};
