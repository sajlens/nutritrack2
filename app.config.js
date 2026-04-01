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
    plugins: ["expo-router"],
    extra: {
      router: {},
      eas: { projectId: "80ccab48-ced7-4fd7-821f-2e6aee0954e3" },
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      anthropicApiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY,
    },
  },
};
