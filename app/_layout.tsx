import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import LoginScreen from '../components/LoginScreen';

// W przeglądarce na komputerze apka nie rozciąga się na cały ekran,
// tylko ma szerokość telefonu i stoi na środku.
function WebFrame({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: '#fff' }}>
        {children}
      </View>
    </View>
  );
}

export default function Layout() {
  // undefined = jeszcze sprawdzamy zapamiętaną sesję, null = niezalogowana
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator color="#16a34a" />
      </View>
    );
  }

  if (!session) {
    return (
      <SafeAreaProvider>
        <WebFrame>
          <LoginScreen />
        </WebFrame>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <WebFrame>
      <Tabs screenOptions={{
        tabBarActiveTintColor: '#16a34a',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e5e7eb' },
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#111827',
      }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dziś',
            tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            title: 'Dodaj',
            tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'Historia',
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen name="edit-meal" options={{ href: null }} />
        <Tabs.Screen name="add-product" options={{ href: null, title: 'Nowy produkt' }} />
      </Tabs>
      </WebFrame>
    </SafeAreaProvider>
  );
}
