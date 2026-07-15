import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { styles } from '../styles/styles';

type Props = {
  onEntrar: () => void;
};

export function LoginScreen({ onEntrar }: Props) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');

  return (
    <SafeAreaView style={styles.loginContainer}>
      <View style={styles.loginCard}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoCircleText}>S</Text>
        </View>

        <Text style={styles.appName}>SIGEP2.0</Text>

        <Text style={styles.appSubtitle}>
          Sistema de Gestão de Requisições
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Usuário / matrícula"
          value={usuario}
          onChangeText={setUsuario}
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Senha"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
        />

        <TextInput
          style={styles.input}
          placeholder="Código de autenticação"
          value={codigo}
          onChangeText={setCodigo}
          keyboardType="number-pad"
        />

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={onEntrar}
        >
          <Text style={styles.primaryButtonText}>Entrar</Text>
        </Pressable>

        <Text style={styles.footerText}>
          Protótipo visual — sem conexão com o PCNet
        </Text>
      </View>
    </SafeAreaView>
  );
}