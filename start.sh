#!/bin/bash

set +m  # Disabilita job control messages (no "Terminated" output)

echo "Avvio Ruggine Chat..."

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Config
PORT=${PORT:-3000}
RUST_LOG_FILE="/tmp/rust_server.log"
VITE_LOG_FILE="/tmp/vite_server.log"
CLEANUP_CALLED=0

# Cleanup handler
cleanup() {
    if [ $CLEANUP_CALLED -eq 1 ]; then
        return
    fi
    CLEANUP_CALLED=1
    
    if [ -n "$TAIL_PID" ] && ps -p $TAIL_PID > /dev/null 2>&1; then
        kill $TAIL_PID 2>/dev/null || true
    fi
    if [ -n "$RUST_PID" ] && ps -p $RUST_PID > /dev/null 2>&1; then
        kill $RUST_PID 2>/dev/null || true
    fi
    if [ -n "$VITE_PID" ] && ps -p $VITE_PID > /dev/null 2>&1; then
        kill $VITE_PID 2>/dev/null || true
    fi
    if [ -n "$MOSQUITTO_PID" ] && ps -p $MOSQUITTO_PID > /dev/null 2>&1; then
        kill $MOSQUITTO_PID 2>/dev/null || true
    fi
    echo -e "${YELLOW}Arresto servizi...${NC}"
}
trap cleanup EXIT INT

# Verifica se il server Rust è già in esecuzione sulla porta scelta
echo "Controllo porta ${PORT}..."
if lsof -Pi :${PORT} -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}Trovato processo sulla porta ${PORT}, lo termino...${NC}"
    lsof -ti :${PORT} | xargs kill -9 2>/dev/null || true
    sleep 1
    echo -e "${GREEN}Porta ${PORT} liberata${NC}"
fi

# Verifica se Mosquitto è in esecuzione
echo "Controllo Mosquitto..."
if lsof -Pi :1883 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${GREEN}Mosquitto è già in esecuzione sulla porta 1883${NC}"
else
    echo -e "${YELLOW}Mosquitto non è in esecuzione, lo avvio...${NC}"
    
    # Tenta di avviare Mosquitto con la configurazione locale
    mosquitto -c mosquitto.conf > /tmp/mosquitto.log 2>&1 &
    MOSQUITTO_PID=$!
    
    # Attendi che Mosquitto si avvii
    sleep 2
    
    # Verifica che sia partito
    if ps -p $MOSQUITTO_PID > /dev/null 2>&1; then
        echo -e "${GREEN}Mosquitto avviato con PID $MOSQUITTO_PID${NC}"
    else
        echo -e "${RED}Errore nell'avvio di Mosquitto${NC}"
        echo "   Log: cat /tmp/mosquitto.log"
        exit 1
    fi
fi

#############################
# 1) Avvia frontend (background)
#############################
echo ""
echo -e "${YELLOW}Avvio frontend React...${NC}"
pushd client-react/client >/dev/null

# Verifica che sia installato npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm non trovato. Installa Node.js${NC}"
    exit 1
fi

# Installa dipendenze se necessario
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installazione dipendenze npm...${NC}"
    npm install
fi

# Avvia dev server in background e logga su file
echo -e "${YELLOW}Log Vite: ${VITE_LOG_FILE}${NC}"
nohup npm run dev > "${VITE_LOG_FILE}" 2>&1 &
VITE_PID=$!
popd >/dev/null

sleep 2
if ps -p $VITE_PID > /dev/null 2>&1; then
    echo -e "${GREEN}Frontend avviato con PID $VITE_PID${NC}"
else
    echo -e "${RED}Errore nell'avvio del frontend${NC}"
    echo "   Log: tail -n +1 ${VITE_LOG_FILE}"
    exit 1
fi

#############################
# 2) Avvia backend (foreground con log)
#############################
echo ""
echo -e "${YELLOW}Avvio server Rust su porta ${PORT}...${NC}"
echo -e "${YELLOW}Log Rust: ${RUST_LOG_FILE}${NC}"

# Avvia il server Rust in background e logga su file
echo "" > "${RUST_LOG_FILE}"
PORT=${PORT} cargo run >> "${RUST_LOG_FILE}" 2>&1 &
RUST_PID=$!

sleep 2
if ps -p $RUST_PID > /dev/null 2>&1; then
        echo -e "${GREEN}Server Rust avviato con PID $RUST_PID${NC}"
else
        echo -e "${RED}Errore nell'avvio del server Rust${NC}"
        echo "   Ultime righe log:"
        tail -n 50 "${RUST_LOG_FILE}" || true
        exit 1
fi

# Stream dei log filtrato: niente linee '[RUST] ', mostra tutto finché non parte il server,
# poi solo le righe che iniziano con [LOG]
tail -n +1 -F "${RUST_LOG_FILE}" \
| awk '
    BEGIN { started = 0 }
    {
        if (index($0, "[RUST]")) next;
        if (!started) {
            print;
            if ($0 ~ /Server avviato su http/) started = 1;
        } else {
            if ($0 ~ /^\[LOG\]/) print;
        }
    }
' &
TAIL_PID=$!

# Rimani in attesa del processo Rust; alla sua uscita, il trap farà cleanup
wait $RUST_PID
