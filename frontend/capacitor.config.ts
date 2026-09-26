import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kryzen.chat',
  appName: 'Kryzen',
  webDir: 'dist',
  plugins: {
    // No providers are loaded by default — Google native sign-in needs
    // its provider listed or signInWithGoogle errors out.
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com'],
    },
  },
};

export default config;
