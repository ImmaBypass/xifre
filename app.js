const SUPABASE_URL = "https://doppekualeyvrlbtumze.supabase.co";
const SUPABASE_KEY = "sb_publishable_96LHpw9bFMWX6tAl6p_6qA__ZANADwE";

const { createClient } = window.supabase;

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
