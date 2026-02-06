document.addEventListener('DOMContentLoaded', () => {
    
    // --- CONFIGURAÇÃO GLOBAL ---
    // Distância aprox. 1.600km (MG -> PB)
    // Tempo estimado: 36 Horas
    const TEMPO_TOTAL_VIAGEM_HORAS = 36; 

    // --- BANCO DE DADOS DE ROTAS ---
    const ROTAS = {
        "58036": {  // <--- SENHA
            id: "rota_jp_pb",
            
            // VISUAL
            destinoNome: "João Pessoa - PB", 
            destinoDesc: "CEP: 58036-435 (Jardim Oceania)",
            
            // COORDENADAS [Longitude, Latitude]
            start: [-43.8750, -16.7350], // Montes Claros
            end:   [-34.8430, -7.0910],  // João Pessoa
            
            // Simula que ele já viajou 4 horas antes de ser parado
            offsetHoras: 4,

            // --- REGRA DE PARADA: PRF SALINAS ---
            verificarRegras: function(posicaoAtual, map, loopInterval, timeBadge, carMarker) {
                
                // Coordenada exata da PRF em Salinas - MG (BR-251)
                // Formato Leaflet [Latitude, Longitude]
                const CHECKPOINT_PRF = [-16.1596, -42.2998]; 
                
                // 1. PÁRA O MOVIMENTO
                clearInterval(loopInterval); 
                
                // 2. FORÇA A POSIÇÃO NA BLITZ
                if(carMarker) carMarker.setLatLng(CHECKPOINT_PRF);
                
                // 3. ZOOM NA CENA (Zoom 16 para ver detalhes)
                if(map) map.setView(CHECKPOINT_PRF, 16);

                // 4. STATUS VERMELHO E PISCANDO
                if(timeBadge) {
                    timeBadge.innerText = "RETIDO NA FISCALIZAÇÃO";
                    timeBadge.style.backgroundColor = "#b71c1c"; 
                    timeBadge.style.color = "white";
                    timeBadge.style.border = "2px solid #ff5252";
                    timeBadge.style.animation = "blink 1.5s infinite"; // Efeito piscando
                }

                // 5. PLAQUINHA VISUAL
                const htmlPlaquinha = `
                    <div style="display: flex; align-items: center; gap: 10px; font-family: sans-serif; min-width: 200px;">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Pol%C3%ADcia_Rodovi%C3%A1ria_Federal_logo.svg/1024px-Pol%C3%ADcia_Rodovi%C3%A1ria_Federal_logo.svg.png" style="width: 45px; height: auto;">
                        <div style="text-align: left; line-height: 1.2;">
                            <strong style="font-size: 14px; color: #b71c1c; display: block;">PRF - BLOQUEIO</strong>
                            <span style="font-size: 11px; color: #333; font-weight: bold;">Salinas - MG</span><br>
                            <span style="font-size: 11px; color: #666;">Fiscalização de Carga</span>
                        </div>
                    </div>`;

                if(carMarker) {
                    carMarker.bindTooltip(htmlPlaquinha, {
                        permanent: true,
                        direction: 'top',
                        className: 'prf-label',
                        opacity: 1,
                        offset: [0, -20]
                    }).openTooltip();
                }

                return true; // Retorna true para avisar que parou
            }
        }
    };

    // --- VARIÁVEIS DE CONTROLE ---
    let map, polyline, carMarker;
    let fullRoute = []; 
    let rotaAtual = null;
    let loopInterval = null;

    // --- CSS EXTRA PARA O PISCA-PISCA ---
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }
        .prf-label { background: white; border: 2px solid #b71c1c; border-radius: 8px; padding: 5px; }
    `;
    document.head.appendChild(style);

    // --- INICIALIZAÇÃO ---
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', verificarCodigo);
    }

    verificarSessaoSalva();

    // --- FUNÇÕES ---

    function verificarCodigo() {
        const input = document.getElementById('access-code');
        const codigoDigitado = input.value.trim(); 
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
        
        const descElement = document.getElementById('destino-desc');
        if(descElement) descElement.innerText = rotaAtual.destinoDesc;

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
            alert("Erro ao traçar rota. Tente novamente.");
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
                <p>Veículo sem nota fiscal</p>
                <p><strong>Origem:</strong> Montes Claros - MG</p>
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

        map = L.map('map', { zoomControl: false }).setView(fullRoute[0], 5);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; CartoDB', maxZoom: 18
        }).addTo(map);

        polyline = L.polyline(fullRoute, {
            color: '#2563eb', weight: 5, opacity: 0.7, dashArray: '10, 10', lineJoin: 'round'
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

        // --- VERIFICAÇÃO DE REGRAS (BLITZ/PARADAS) ---
        // Se a rota tiver regras especiais, executa aqui
        const timeBadge = document.getElementById('time-badge');
        if (rotaAtual.verificarRegras) {
            // Passamos [0,0] pois a função força a posição correta da PRF
            const parou = rotaAtual.verificarRegras([0,0], map, loopInterval, timeBadge, carMarker);
            if (parou) return; // Se parou, interrompe o resto da função
        }
        // ---------------------------------------------

        const codigoAtivo = localStorage.getItem('codigoAtivo');
        const keyStorage = 'inicioViagem_' + codigoAtivo;
        
        let inicio = parseInt(localStorage.getItem(keyStorage));
        if (!inicio) {
            inicio = Date.now();
            localStorage.setItem(keyStorage, inicio);
        }

        const agora = Date.now();
        const tempoDecorridoMs = agora - inicio;
        const tempoComOffset = tempoDecorridoMs + (rotaAtual.offsetHoras || 0) * 3600000;
        const tempoTotalMs = TEMPO_TOTAL_VIAGEM_HORAS * 60 * 60 * 1000;
        
        let progresso = tempoComOffset / tempoTotalMs;

        if (progresso < 0) progresso = 0;
        if (progresso > 1) progresso = 1;

        const posicaoAtual = getCoordenadaPorProgresso(progresso);
        if(carMarker) carMarker.setLatLng(posicaoAtual);
        
        desenharLinhaRestante(posicaoAtual, progresso);

        if (progresso >= 1) {
            if(timeBadge) {
                timeBadge.innerText = "ENTREGUE";
                timeBadge.style.background = "#d1fae5";
                timeBadge.style.color = "#065f46";
            }
        } else {
            const msRestantes = tempoTotalMs - tempoComOffset;
            const horasRestantes = (msRestantes / (1000 * 60 * 60)).toFixed(1);
            
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
            color: '#2563eb', weight: 5, opacity: 0.7, dashArray: '10, 10', lineJoin: 'round'
        }).addTo(map);
    }
});
