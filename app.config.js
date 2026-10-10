export default {
  expo: {
    name: "NutriTrack",
    slug: "nutritrack",
    version: "1.0.0",
    orientation: "portrait",
    scheme: "nutritrack",
    userInterfaceStyle: "light",
    ios: { supportsTablet: false },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      package: "com.nutritrack.app",
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/favicon.png",
    },
    plugins: ["expo-router", "expo-status-bar"],
    extra: {
      router: {},
      eas: { projectId: "80ccab48-ced7-4fd7-821f-2e6aee0954e3" },
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      // Klucz Anthropic NIE trafia już do apki — jest w Cloudflare (functions/api/claude.js).
      // Ten adres jest potrzebny tylko w apce na Androida (w przeglądarce wystarczy ta sama domena).
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    },
  },
};
