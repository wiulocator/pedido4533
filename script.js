document.addEventListener('DOMContentLoaded', () => {
    
    // --- CONFIGURAÇÃO DAS ROTAS ---
    // A chave é a SENHA. O valor são os dados da viagem.
    // --- CONFIGURAÇÃO: PROJETO BAHIA ---
const TEMPO_TOTAL_VIAGEM_HORAS = 48; 

const ROTAS = {
    "567896": { // Senha de acesso
        id: "rota_ba",
        destinoNome: "Camamu - BA",
        destinoDesc: "Praça Dr. Pirajá da Silva (Centro)",
        
        // Começa do zero, sem vantagem
        offsetHoras: 0, 
        
        start: [-43.8750, -16.7350], // Montes Claros
        end:   [-39.1039, -13.9450], // Camamu

        // Sem regras de parada (Viagem direta)
        verificarRegras: function() { 
            return false; 
        }
    }
};

    const TEMPO_TOTAL_VIAGEM_HORAS = 48; 

    // Variáveis Globais
    let map, polyline, carMarker;
    let fullRoute = []; 
    let rotaAtual = null; // Vai guardar qual rota o usuário escolheu

    // --- VINCULA O BOTÃO ---
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', verificarCodigo);
    }

    // Se já tiver logado antes (refresh na página), tenta restaurar a sessão
    verificarSessaoSalva();

    // --- FUNÇÕES ---

    function verificarCodigo() {
        const input = document.getElementById('access-code');
        const codigoDigitado = input.value;
        const errorMsg = document.getElementById('error-msg');

        // Verifica se o código existe na nossa lista de ROTAS
        if (ROTAS[codigoDigitado]) {
            
            // Salva qual rota estamos vendo e o horário de início
            localStorage.setItem('codigoAtivo', codigoDigitado);
            if (!localStorage.getItem('inicioViagem_' + codigoDigitado)) {
                localStorage.setItem('inicioViagem_' + codigoDigitado, Date.now());
            }

            carregarInterface(codigoDigitado);

        } else {
            errorMsg.style.display = 'block';
            input.style.borderColor = 'red';
        }
    }

    function verificarSessaoSalva() {
        const codigoSalvo = localStorage.getItem('codigoAtivo');
        // Se existe um código salvo e a tela de login ainda está visível
        if (codigoSalvo && ROTAS[codigoSalvo] && document.getElementById('login-overlay').style.display !== 'none') {
            // Preenche o input e clica automaticamente (ou carrega direto)
            document.getElementById('access-code').value = codigoSalvo;
            // Opcional: Auto-login
            // verificarCodigo(); 
        }
    }

    function carregarInterface(codigo) {
        rotaAtual = ROTAS[codigo];
        const overlay = document.getElementById('login-overlay');
        const infoCard = document.getElementById('info-card');
        const btn = document.getElementById('btn-login');

        // Feedback visual
        btn.innerText = "Calculando rota...";
        btn.disabled = true;

        // Busca a rota específica desse código
        buscarRotaReal(rotaAtual.start, rotaAtual.end).then(() => {
            overlay.style.display = 'none';
            infoCard.style.display = 'flex';
            
            atualizarTextoInfo();
            iniciarMapa();
        }).catch(err => {
            console.error(err);
            alert("Erro ao buscar rota. Tente novamente.");
            btn.innerText = "Rastrear Carga";
            btn.disabled = false;
        });
    }

    function atualizarTextoInfo() {
        const infoTextDiv = document.querySelector('.info-text');
        if(infoTextDiv && rotaAtual) {
            const title = infoTextDiv.querySelector('h3').outerHTML;
            const badge = infoTextDiv.querySelector('.status-badge').outerHTML;
            
            infoTextDiv.innerHTML = `
                ${title}
                ${badge}
                <p><strong>Origem:</strong> Montes Claros - MG</p>
                <p><strong>Destino:</strong> ${rotaAtual.destinoNome}</p>
                <p style="font-size: 11px; color: #999;">${rotaAtual.destinoDesc}</p>
            `;
        }
    }

    async function buscarRotaReal(start, end) {
        // Pede a rota ao OSRM usando as coordenadas da rota selecionada
        const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            fullRoute = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
        } else {
            throw new Error("Rota não encontrada");
        }
    }

    function iniciarMapa() {
        if (map) return; // Se já iniciou, não recria

        map = L.map('map', { zoomControl: false }).setView(fullRoute[0], 6);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; CartoDB', maxZoom: 18
        }).addTo(map);

        const truckIcon = L.divIcon({
            className: 'car-marker',
            html: '<div class="car-icon">🚛</div>',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        carMarker = L.marker(fullRoute[0], { icon: truckIcon }).addTo(map);

        // Marcador da Origem (Montes Claros)
        L.marker(fullRoute[0]).addTo(map)
             .bindPopup("<b>Origem:</b><br>Montes Claros - MG");

        // Marcador do Destino (Varia conforme o código)
        const destinoFinal = fullRoute[fullRoute.length - 1];
        L.marker(destinoFinal).addTo(map)
            .bindPopup(`<b>Destino:</b><br>${rotaAtual.destinoNome}<br>${rotaAtual.destinoDesc}`).openPopup();

        // Loop de atualização
        setInterval(atualizarPosicaoTempoReal, 1000);
        atualizarPosicaoTempoReal();
    }

    function atualizarPosicaoTempoReal() {
        if (fullRoute.length === 0 || !rotaAtual) return;

        // Pega o tempo específico DESTA rota (usando o ID da rota no storage)
        // Isso impede que a rota da Bahia use o tempo da rota do Paraná
        const keyStorage = 'inicioViagem_' + document.getElementById('access-code').value;
        const inicio = parseInt(localStorage.getItem(keyStorage));
        
        const agora = Date.now();
        const tempoDecorridoMs = agora - inicio;
        const tempoTotalMs = TEMPO_TOTAL_VIAGEM_HORAS * 60 * 60 * 1000;

        let progresso = tempoDecorridoMs / tempoTotalMs;

        const timeBadge = document.getElementById('time-badge');

        if (progresso >= 1) {
            progresso = 1;
            if(timeBadge) {
                timeBadge.innerText = "ENTREGUE";
                timeBadge.style.color = "green";
                timeBadge.style.backgroundColor = "#ccffcc";
            }
        } else {
            const horasRestantes = ((tempoTotalMs - tempoDecorridoMs) / (1000 * 60 * 60)).toFixed(1);
            if(timeBadge) {
                timeBadge.innerText = `CHEGADA EM ${horasRestantes}h`;
            }
        }

        const posicaoAtual = getCoordenadaPorProgresso(progresso);
        
        if(carMarker) carMarker.setLatLng(posicaoAtual);
        
        desenharLinhaRestante(posicaoAtual, progresso);
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
            color: '#2e7d32', weight: 5, opacity: 0.8, dashArray: '10, 10' 
        }).addTo(map);
    }

});
