import React, { useEffect, useState } from 'react';

import PcnetBridgeStatus from './components/PcnetBridgeStatus';
import Login from './components/Login';
import GeradorLaudo from './components/GeradorLaudo';
import AdminPanel from './components/AdminPanel';
import MinhaConta from './components/MinhaConta';

import api from './api/api';


const icons = {
    balistica: '🎯',
    eficiencia_objeto: '🔎',
    drogas: '🧪'
};


export default function App() {

    const [usuario, setUsuario] = useState(null);
    const [authStatus, setAuthStatus] = useState('checking');

    const [aba, setAba] = useState('inicio');

    const [catalogo, setCatalogo] = useState([]);
    const [especie, setEspecie] = useState(null);

    const [modalEspecie, setModalEspecie] = useState(false);
    const [modalFoto, setModalFoto] = useState(false);

    const [foto, setFoto] = useState(null);

    const [ia, setIa] = useState(false);
    const [dadosIA, setDadosIA] = useState(null);


    /* =========================================================
       CATÁLOGO
       ========================================================= */

    async function carregarCatalogo() {

        try {

            const resposta = await api.get('/catalogo');

            setCatalogo(
                resposta.data || []
            );

        } catch (e) {

            if (e.response?.status !== 401) {
                console.error(e);
            }
        }
    }


    /* =========================================================
       SESSÃO
       ========================================================= */

    useEffect(() => {

        (async () => {

            try {

                const resposta =
                    await api.get('/auth/me');

                if (
                    resposta.data?.autenticado &&
                    resposta.data?.usuario
                ) {

                    setUsuario(
                        resposta.data.usuario
                    );

                    setAuthStatus(
                        'authenticated'
                    );

                } else {

                    setAuthStatus(
                        'unauthenticated'
                    );
                }

            } catch {

                setAuthStatus(
                    'unauthenticated'
                );
            }

        })();

    }, []);


    useEffect(() => {

        if (
            authStatus === 'authenticated'
        ) {
            carregarCatalogo();
        }

    }, [authStatus]);


    async function logout() {

        try {
            await api.post('/auth/logout');
        } catch {
            // Mesmo que o backend falhe,
            // limpa a sessão local.
        }

        setUsuario(null);
        setAuthStatus('unauthenticated');
        setAba('inicio');
    }


    /* =========================================================
       NOVO LAUDO
       ========================================================= */

    function novo() {

        setFoto(null);
        setDadosIA(null);
        setModalEspecie(true);
    }


    function escolher(v) {

        if (!v.tem_template) {

            alert(
                'Esta espécie ainda não possui template. ' +
                'Solicite ao administrador.'
            );

            return;
        }

        setEspecie(v);
        setModalEspecie(false);

        if (
            v.formulario === 'drogas'
        ) {

            setFoto(null);
            setDadosIA(null);
            setAba('gerador');

        } else {

            setModalFoto(true);
        }
    }


    function semFoto() {

        setModalFoto(false);
        setFoto(null);
        setDadosIA(null);

        setAba('gerador');
    }


    function manualFoto() {

        setModalFoto(false);
        setDadosIA(null);

        setAba('gerador');
    }


    async function analisar() {

        if (
            !foto ||
            !especie
        ) {
            return;
        }

        const fd =
            new FormData();

        fd.append(
            'foto_objeto',
            foto
        );

        fd.append(
            'especieId',
            String(especie.id)
        );

        try {

            setIa(true);

            const resposta =
                await api.post(
                    '/analisar-foto',
                    fd
                );

            setDadosIA(
                resposta.data.dadosForm
            );

            setModalFoto(false);

            setAba('gerador');

        } catch (e) {

            alert(
                e.response?.data?.erro ||
                'Falha ao analisar imagem.'
            );

        } finally {

            setIa(false);
        }
    }


    /* =========================================================
       AUTENTICAÇÃO
       ========================================================= */

    if (
        authStatus === 'checking'
    ) {

        return (
            <div className="
                min-h-screen
                bg-gray-900
                flex
                items-center
                justify-center
                text-white
            ">
                Verificando sessão...
            </div>
        );
    }


    if (
        authStatus !== 'authenticated' ||
        !usuario
    ) {

        return (
            <Login
                onLoginSuccess={(u) => {

                    setUsuario(u);

                    setAuthStatus(
                        'authenticated'
                    );
                }}
            />
        );
    }


    /* =========================================================
       APLICAÇÃO
       ========================================================= */

    return (

        <div className="
            min-h-screen
            bg-gray-100
            flex
            flex-col
        ">

            {/* =================================================
                HEADER
                ================================================= */}

            <header className="
                bg-white
                shadow-sm
                border-b
                px-8
                py-4
                flex
                justify-between
            ">

                <div className="
                    flex
                    gap-3
                    items-center
                ">

                    <div className="
                        w-10
                        h-10
                        rounded-xl
                        bg-[#0284C7]
                        text-white
                        flex
                        items-center
                        justify-center
                        font-black
                    ">
                        N
                    </div>

                    <div>

                        <b>
                            NEXUS
                        </b>

                        <div className="
                            text-[10px]
                            text-sky-600
                            font-bold
                        ">
                            LAUDOS PERICIAIS
                        </div>

                    </div>

                </div>


                <div className="
                    flex
                    gap-3
                    items-center
                ">

                    <span
                        className={`
                            text-[10px]
                            px-2
                            py-1
                            rounded-full
                            font-bold

                            ${
                                usuario.role === 'admin'
                                    ? 'bg-violet-100 text-violet-700'
                                    : 'bg-gray-100'
                            }
                        `}
                    >

                        {
                            usuario.role === 'admin'
                                ? 'ADMINISTRADOR'
                                : 'USUÁRIO'
                        }

                    </span>


                    <span className="
                        text-xs
                        text-gray-500
                        hidden
                        md:inline
                    ">
                        {usuario.nome}
                    </span>


                    <button
                        onClick={logout}
                        className="
                            bg-gray-100
                            px-4
                            py-2
                            rounded-lg
                        "
                    >
                        Sair
                    </button>

                </div>

            </header>


            {/* =================================================
                NAVEGAÇÃO
                ================================================= */}

            <nav className="
                bg-white
                border-b
                px-8
                flex
                gap-6
            ">

                <button
                    onClick={() =>
                        setAba('inicio')
                    }
                    className={`
                        py-3
                        border-b-2

                        ${
                            aba === 'inicio'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent'
                        }
                    `}
                >
                    🏠 Início
                </button>


                <button
                    onClick={() =>
                        setAba('gerador')
                    }
                    className={`
                        py-3
                        border-b-2

                        ${
                            aba === 'gerador'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent'
                        }
                    `}
                >
                    📄 Laudos
                </button>


                {/* =============================================
                    MINHA CONTA
                    ============================================= */}

                <button
                    onClick={() =>
                        setAba('conta')
                    }
                    className={`
                        py-3
                        border-b-2

                        ${
                            aba === 'conta'
                                ? 'border-sky-600 text-sky-700'
                                : 'border-transparent'
                        }
                    `}
                >
                    👤 Minha conta
                </button>


                {
                    usuario.role === 'admin' && (

                        <button
                            onClick={() =>
                                setAba('admin')
                            }
                            className={`
                                py-3
                                border-b-2

                                ${
                                    aba === 'admin'
                                        ? 'border-violet-600 text-violet-700'
                                        : 'border-transparent'
                                }
                            `}
                        >
                            ⚙️ Administração
                        </button>
                    )
                }

            </nav>


            {/* =================================================
                CONTEÚDO
                ================================================= */}

            <main className="
                flex-1
                p-8
                max-w-7xl
                mx-auto
                w-full
            ">

                {/* =============================================
                    INÍCIO
                    ============================================= */}

                {
                    aba === 'inicio' && (

                        <div className="
                            space-y-6
                        ">

                            <div className="
                                bg-[#0284C7]
                                text-white
                                p-8
                                rounded-2xl
                                flex
                                justify-between
                                items-center
                            ">

                                <div>

                                    <h2 className="
                                        text-3xl
                                        font-bold
                                    ">
                                        Bem-vindo(a), {
                                            usuario.nome
                                                ?.split(' ')[0]
                                        }!
                                    </h2>

                                    <p className="
                                        text-sky-100
                                        text-sm
                                        mt-2
                                    ">
                                        Escolha uma espécie ativa
                                        com template cadastrado.
                                    </p>

                                </div>


                                <button
                                    onClick={novo}
                                    className="
                                        bg-white
                                        text-sky-800
                                        font-bold
                                        px-6
                                        py-3
                                        rounded-xl
                                    "
                                >
                                    Iniciar Novo Laudo ➔
                                </button>

                            </div>


                            <PcnetBridgeStatus />


                            <div className="
                                grid
                                md:grid-cols-2
                                xl:grid-cols-3
                                gap-6
                            ">

                                {
                                    catalogo.map(
                                        (x) => (

                                            <div
                                                key={x.id}

                                                onClick={() =>
                                                    escolher(x)
                                                }

                                                className={`
                                                    bg-white
                                                    p-6
                                                    rounded-2xl
                                                    border

                                                    ${
                                                        x.tem_template
                                                            ? 'cursor-pointer hover:shadow-md'
                                                            : 'opacity-70 border-amber-200'
                                                    }
                                                `}
                                            >

                                                <div className="
                                                    flex
                                                    justify-between
                                                ">

                                                    <span className="
                                                        text-2xl
                                                    ">
                                                        {
                                                            icons[
                                                                x.formulario
                                                            ] || '📄'
                                                        }
                                                    </span>


                                                    <span
                                                        className={`
                                                            text-[10px]
                                                            px-2
                                                            py-1
                                                            rounded-full

                                                            ${
                                                                x.tem_template
                                                                    ? 'bg-emerald-50 text-emerald-700'
                                                                    : 'bg-amber-50 text-amber-700'
                                                            }
                                                        `}
                                                    >

                                                        {
                                                            x.tem_template
                                                                ? `TEMPLATE v${x.template_versao}`
                                                                : 'SEM TEMPLATE'
                                                        }

                                                    </span>

                                                </div>


                                                <h3 className="
                                                    font-bold
                                                    text-lg
                                                    mt-4
                                                ">
                                                    {
                                                        x.nome_exibicao
                                                    }
                                                </h3>


                                                <div className="
                                                    text-xs
                                                    text-sky-700
                                                ">
                                                    {
                                                        x.natureza
                                                    }
                                                </div>


                                                <p className="
                                                    text-sm
                                                    text-gray-500
                                                    mt-2
                                                ">
                                                    {
                                                        x.descricao
                                                    }
                                                </p>

                                            </div>
                                        )
                                    )
                                }

                            </div>

                        </div>
                    )
                }


                {/* =============================================
                    GERADOR DE LAUDO
                    ============================================= */}

                {
                    aba === 'gerador' && (

                        <GeradorLaudo
                            catalogo={catalogo}
                            especieInicialId={
                                especie?.id
                            }
                            dadosIniciaisIA={
                                dadosIA
                            }
                            fotoObjetoInicial={
                                foto
                            }
                            usuario={
                                usuario
                            }
                        />
                    )
                }


                {/* =============================================
                    MINHA CONTA
                    ============================================= */}

                {
                    aba === 'conta' && (

                        <MinhaConta
                            usuario={usuario}
                        />
                    )
                }


                {/* =============================================
                    ADMINISTRAÇÃO
                    ============================================= */}

                {
                    aba === 'admin' &&
                    usuario.role === 'admin' && (

                        <AdminPanel
                            usuario={usuario}
                            onCatalogoAlterado={
                                carregarCatalogo
                            }
                        />
                    )
                }

            </main>


            {/* =================================================
                MODAL - SELEÇÃO DE ESPÉCIE
                ================================================= */}

            {
                modalEspecie && (

                    <div className="
                        fixed
                        inset-0
                        bg-black/50
                        z-50
                        flex
                        items-center
                        justify-center
                        p-4
                    ">

                        <div className="
                            bg-white
                            rounded-2xl
                            p-6
                            w-full
                            max-w-lg
                        ">

                            <h3 className="
                                text-xl
                                font-bold
                                text-center
                                mb-4
                            ">
                                Selecione a Espécie
                            </h3>


                            <div className="
                                space-y-2
                                max-h-[55vh]
                                overflow-auto
                            ">

                                {
                                    catalogo.map(
                                        (x) => (

                                            <button
                                                key={x.id}

                                                disabled={
                                                    !x.tem_template
                                                }

                                                onClick={() =>
                                                    escolher(x)
                                                }

                                                className="
                                                    w-full
                                                    text-left
                                                    p-3
                                                    border
                                                    rounded-lg
                                                    disabled:opacity-50
                                                "
                                            >

                                                <b>
                                                    {
                                                        icons[
                                                            x.formulario
                                                        ] || '📄'
                                                    }

                                                    {' '}

                                                    {
                                                        x.nome_exibicao
                                                    }
                                                </b>


                                                <div className="
                                                    text-xs
                                                    text-gray-500
                                                ">

                                                    {
                                                        x.natureza
                                                    }

                                                    {
                                                        !x.tem_template
                                                            ? ' · sem template'
                                                            : ''
                                                    }

                                                </div>

                                            </button>
                                        )
                                    )
                                }

                            </div>


                            <button
                                onClick={() =>
                                    setModalEspecie(false)
                                }
                                className="
                                    w-full
                                    mt-4
                                    text-gray-500
                                "
                            >
                                Cancelar
                            </button>

                        </div>

                    </div>
                )
            }


            {/* =================================================
                MODAL - FOTO
                ================================================= */}

            {
                modalFoto && (

                    <div className="
                        fixed
                        inset-0
                        bg-black/50
                        z-50
                        flex
                        items-center
                        justify-center
                        p-4
                    ">

                        <div className="
                            bg-white
                            rounded-2xl
                            p-6
                            w-full
                            max-w-md
                            text-center
                            space-y-5
                        ">

                            <h3 className="
                                text-xl
                                font-bold
                            ">
                                Foto do Vestígio
                                (Opcional)
                            </h3>


                            <label className="
                                border-2
                                border-dashed
                                border-sky-300
                                p-6
                                block
                                rounded-xl
                                cursor-pointer
                            ">

                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"

                                    onChange={(e) =>
                                        setFoto(
                                            e.target.files?.[0] ||
                                            null
                                        )
                                    }
                                />

                                {
                                    foto
                                        ? foto.name
                                        : 'Selecionar foto'
                                }

                            </label>


                            {
                                foto ? (

                                    <div className="
                                        space-y-2
                                    ">

                                        {
                                            especie?.formulario ===
                                            'balistica' && (

                                                <button
                                                    onClick={
                                                        analisar
                                                    }
                                                    disabled={
                                                        ia
                                                    }
                                                    className="
                                                        w-full
                                                        bg-sky-600
                                                        text-white
                                                        p-3
                                                        rounded-xl
                                                    "
                                                >

                                                    {
                                                        ia
                                                            ? 'Analisando...'
                                                            : '✨ Analisar com IA'
                                                    }

                                                </button>
                                            )
                                        }


                                        <button
                                            onClick={
                                                manualFoto
                                            }
                                            className="
                                                w-full
                                                bg-gray-100
                                                p-3
                                                rounded-xl
                                            "
                                        >
                                            Preencher manualmente
                                        </button>

                                    </div>

                                ) : (

                                    <button
                                        onClick={
                                            semFoto
                                        }
                                        className="
                                            w-full
                                            bg-gray-100
                                            p-3
                                            rounded-xl
                                        "
                                    >
                                        Continuar sem foto
                                    </button>
                                )
                            }

                        </div>

                    </div>
                )
            }

        </div>
    );
}