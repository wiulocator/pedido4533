document.addEventListener('DOMContentLoaded', () => {
    
    // --- CONFIGURAÇÃO GLOBAL ---
    const TEMPO_TOTAL_VIAGEM_HORAS = 48; 

    // --- BANCO DE DADOS DE ROTAS ---
    const ROTAS = {
        "567896": { 
            id: "rota_ba",
            destinoNome: "Camamu - BA",
            destinoDesc: "Praça Dr. Pirajá da Silva (Centro)",
            
            start: [-43.8750, -16.7350], // Montes Claros
            end:   [-39.1039, -13.9450], // Camamu
            
            // Waypoint em Itabuna mantido para segurar o desenho da rota
            waypoint: [-39.266224, -14.793617], 
            
            // --- AJUSTE DE POSIÇÃO: PÓS-ITAJUÍPE ---
            // Aumentamos para 42 horas.
            // Agora ele com certeza já passou de Itabuna e Itajuípe.
            // Está na reta final (faltam 6h).
            offsetHoras: 42
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
        const codigoDigitado = input.value;
        const errorMsg = document.getElementById('error-msg');

        if (ROTAS[codigoDigitado]) {
            localStorage.setItem('codigoAtivo', codigoDigitado);
            
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

        buscarRotaReal(rotaAtual.start, rotaAtual.end, rotaAtual.waypoint).then(() => {
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
                <p><strong>Origem:</strong> Montes Claros - MG</p>
                <p><strong>Destino:</strong> ${rotaAtual.destinoNome}</p>
            `;
        }
    }

    async function buscarRotaReal(start, end, waypoint) {
        let coordsUrl = `${start[0]},${start[1]};${end[0]},${end[1]}`;
        
        if (waypoint) {
            coordsUrl = `${start[0]},${start[1]};${waypoint[0]},${waypoint[1]};${end[0]},${end[1]}`;
        }

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
        const inicio = parseInt(localStorage.getItem(keyStorage));
        const agora = Date.now();
        
        let tempoDecorridoMs = agora - inicio;
        
        // Adiciona 42 horas ao tempo decorrido
        if (rotaAtual.offsetHoras) {
            tempoDecorridoMs += (rotaAtual.offsetHoras * 60 * 60 * 1000);
        }

        const tempoTotalMs = TEMPO_TOTAL_VIAGEM_HORAS * 60 * 60 * 1000;
        let progresso = tempoDecorridoMs / tempoTotalMs;

        if (progresso < 0) progresso = 0;
        if (progresso > 1) progresso = 1;

        const posicaoAtual = getCoordenadaPorProgresso(progresso);
        if(carMarker) carMarker.setLatLng(posicaoAtual);
        
        desenharLinhaRestante(posicaoAtual, progresso);

        const timeBadge = document.getElementById('time-badge');
        if (progresso >= 1) {
            if(timeBadge) {
                timeBadge.innerText = "ENTREGUE";
                timeBadge.style.background = "#d1fae5";
                timeBadge.style.color = "#065f46";
            }
        } else {
            const horasRestantes = ((tempoTotalMs - tempoDecorridoMs) / (1000 * 60 * 60)).toFixed(1);
            if(timeBadge) {
                timeBadge.innerText = `EM TRÂNSITO: FALTA ${horasRestantes}h`;
                timeBadge.style.background = "#e3f2fd";
                timeBadge.style.color = "#1976d2";
                timeBadge.style.border = "none";
                timeBadge.style.animation = "none";
            }
            carMarker.unbindTooltip(); 
        }
    }

    function getCoordenadaPorProgresso(pct) {
        const totalPontos = fullRoute.length - 1;
        const pontoVirtual = pct * totalPontos;
        
        const indexAnterior = Math.floor(pontoVirtual);
        const indexProximo = Math.ceil(pontoVirtual);
        
        if (indexAnterior >= totalPontos) return fullRoute[totalPontos];

        const p1 = fullRoute[indexAnterior];
        const p2 = fullRoute[indexProximo];
        
        const resto = pontoVirtual - indexAnterior;
        
        const lat = p1[0] + (p2[0] - p1[0]) * resto;
        const lng = p1[1] + (p2[1] - p1[1]) * resto;
        
        return [lat, lng];
    }

    function desenharLinhaRestante(posicaoAtual, pct) {
        if (polyline) map.removeLayer(polyline);

        const indexAtual = Math.floor(pct * (fullRoute.length - 1));
        const rotaRestante = [posicaoAtual, ...fullRoute.slice(indexAtual + 1)];

        polyline = L.polyline(rotaRestante, {
            color: '#2c3e50', weight: 5, opacity: 0.6, dashArray: '10, 10', lineJoin: 'round'
        }).addTo(map);
    }
});
