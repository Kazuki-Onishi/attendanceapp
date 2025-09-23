import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

const Splash: React.FC = () => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={styles.label}>Initializing...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  label: {
    marginTop: 16,
    color: '#f8fafc',
    fontSize: 16,
    letterSpacing: 1,
  },
});

export default Splash;
