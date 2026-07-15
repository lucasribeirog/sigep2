import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoginScreen } from './src/screens/LoginScreen';
import { ListaScreen } from './src/screens/ListaScreen';
import { DetalheScreen } from './src/screens/DetalheScreen';

import { requisicoesMock } from './src/data/requisicoesMock';
import type { Requisicao } from './src/types/requisicao';

type Tela = 'login' | 'lista' | 'detalhe';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [tela, setTela] = useState<Tela>('login');
  const [requisicaoSelecionada, setRequisicaoSelecionada] =
    useState<Requisicao | null>(null);

  function entrar() {
    setRequisicaoSelecionada(null);
    setTela('lista');
  }

  function sair() {
    setRequisicaoSelecionada(null);
    setTela('login');
  }

  function abrirDetalhe(requisicao: Requisicao) {
    setRequisicaoSelecionada(requisicao);
    setTela('detalhe');
  }

  function voltarLista() {
    setTela('lista');
  }

  if (tela === 'login') {
    return <LoginScreen onEntrar={entrar} />;
  }

  if (tela === 'detalhe' && requisicaoSelecionada !== null) {
    return (
      <DetalheScreen
        requisicao={requisicaoSelecionada}
        onVoltar={voltarLista}
      />
    );
  }

  return (
    <ListaScreen
      requisicoes={requisicoesMock}
      onAbrirDetalhe={abrirDetalhe}
      onSair={sair}
    />
  );
}