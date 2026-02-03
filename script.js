document.addEventListener('DOMContentLoaded', () => {
    
    // --- CONFIGURAÇÃO GLOBAL ---
    // Viagem expressa de 24 horas
    const TEMPO_TOTAL_VIAGEM_HORAS = 24; 

    // --- BANCO DE DADOS DE ROTAS ---
    const ROTAS = {
        "TER24H": {  // <--- NOVA SENHA
            id: "rota_ce",
            
            // INFORMAÇÕES VISUAIS
            destinoNome: "Caucaia - CE", 
            destinoDesc: "CEP: 61642-180",
            
            // COORDENADAS [Longitude, Latitude]
            // Origem: Teresina - PI
            start: [-42.8019, -5.0919], 
            
            // Destino: Caucaia - CE (Região do CEP 61642-180)
            end:   [-38.6100, -3.7500], 
            
            // Começa do zero (Sem adiantamento)
            offsetHoras: 0 
        }
    };

    // --- VARIÁVEIS DE CONTROLE ---
    let map, polyline, carMarker;
    let fullRoute = []; 
    let rotaAtual = null;
    let loopInterval = null;

    // --- INICIALIZAÇÃO ---
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', verificarCodigo);
    }

    verificarSessaoSalva();

    // --- FUNÇÕES ---

    function verificarCodigo() {
        const input = document.getElementById('access-code');
        const codigoDigitado = input.value.toUpperCase(); // Garante maiúsculas
        const errorMsg = document.getElementById('error-msg');

        if (ROTAS[codigoDigitado]) {
            localStorage.setItem('codigoAtivo', codigoDigitado);
            
            // Cria uma nova chave de tempo baseada na senha
            // Assim, cada rota tem seu próprio cronômetro independente
            const keyStorage = 'inicioViagem_' + codigoDigitado;
            
            if (!localStorage.getItem(keyStorage)) {
                localStorage.setItem(keyStorage, Date.now());
            }

            carregarInterface(codigoDigitado);
        } else {
            if(errorMsg) errorMsg.style.display = 'block';
            input.style.borderColor = 'red';
        }
    }

    function verificarSessaoSalva() {
        const codigoSalvo = localStorage.getItem('codigoAtivo');
        const overlay = document.getElementById('login-overlay');
        
        // Só recupera se a tela de login ainda estiver visível
        if (codigoSalvo && ROTAS[codigoSalvo] && overlay && overlay.style.display !== 'none') {
            document.getElementById('access-code').value = codigoSalvo;
        }
    }

    function carregarInterface(codigo) {
        rotaAtual = ROTAS[codigo];
        const overlay = document.getElementById('login-overlay');
        const infoCard = document.getElementById('info-card');
        const btn = document.getElementById('btn-login');

        if(btn) {
            btn.innerText = "Localizando veículo...";
            btn.disabled = true;
        }

        buscarRotaReal(rotaAtual.start, rotaAtual.end).then(() => {
            if(overlay) overlay.style.display = 'none';
            if(infoCard) infoCard.style.display = 'flex';
            atualizarTextoInfo();
            iniciarMapa();
        }).catch(err => {
            console.error(err);
            alert("Erro de conexão com satélite de rota.");
            if(btn) {
                btn.innerText = "Tentar Novamente";
                btn.disabled = false;
            }
        });
    }

    function atualizarTextoInfo() {
        const infoTextDiv = document.querySelector('.info-text');
        if(infoTextDiv && rotaAtual) {
            infoTextDiv.innerHTML = `
                <h3>Rastreamento Rodoviário</h3>
                <span id="time-badge" class="status-badge">CONECTANDO...</span>
                <p><strong>Origem:</strong> Teresina - PI</p>
                <p><strong>Destino:</strong> ${rotaAtual.destinoNome}</p>
                <p style="font-size: 11px; color: #666;">${rotaAtual.destinoDesc}</p>
            `;
        }
    }

    async function buscarRotaReal(start, end) {
        const coordsUrl = `${start[0]},${start[1]};${end[0]},${end[1]}`;
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsUrl}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            fullRoute = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
        } else {
            throw new Error("Rota não encontrada");
        }
    }

    function iniciarMapa() {
        if (map) return; 

        map = L.map('map', { zoomControl: false }).setView(fullRoute[0], 6);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; CartoDB', maxZoom: 18
        }).addTo(map);

        polyline = L.polyline(fullRoute, {
            color: '#2c3e50', weight: 5, opacity: 0.6, dashArray: '10, 10', lineJoin: 'round'
        }).addTo(map);

        const truckIcon = L.divIcon({
            className: 'car-marker',
            html: '<div class="car-icon" style="font-size:35px;">🚛</div>',
            iconSize: [40, 40], iconAnchor: [20, 20]
        });

        carMarker = L.marker(fullRoute[0], { icon: truckIcon }).addTo(map);
        L.marker(fullRoute[fullRoute.length - 1]).addTo(map).bindPopup(`<b>Destino:</b> ${rotaAtual.destinoNome}`);

        if (loopInterval) clearInterval(loopInterval);
        loopInterval = setInterval(atualizarPosicaoTempoReal, 1000);
        
        atualizarPosicaoTempoReal(); 
    }

    function atualizarPosicaoTempoReal() {
        if (fullRoute.length === 0 || !rotaAtual) return;

        const codigoAtivo = localStorage.getItem('codigoAtivo');
        const keyStorage = 'inicioViagem_' + codigoAtivo;
        
        // Garante que existe data de início
        let inicio = parseInt(localStorage.getItem(keyStorage));
        if (!inicio) {
            inicio = Date.now();
            localStorage.setItem(keyStorage, inicio);
        }

        const agora = Date.now();
        
        // Cálculo de Progresso
        const tempoDecorridoMs = agora - inicio;
        // Adiciona offset se houver (neste caso é 0)
        const tempoComOffset = tempoDecorridoMs + (rotaAtual.offsetHoras || 0) * 3600000;
        
        const tempoTotalMs = TEMPO_TOTAL_VIAGEM_HORAS * 60 * 60 * 1000;
        let progresso = tempoComOffset / tempoTotalMs;

        // Limites (0% a 100%)
        if (progresso
