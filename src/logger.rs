use sysinfo::{System, Pid};
use std::{thread, time::Duration};

pub fn main(pid: Pid) {
    // --- FIX: Avviamo un thread separato ---
    // Questo comando dice: "Esegui il codice tra graffe in parallelo"
    // Così questa funzione finisce subito e il main.rs può proseguire.
    thread::spawn(move || {
        
        let mut sys = System::new_all();

        loop {
            sys.refresh_all();

            // CPU totale del sistema (versione aggiornata sysinfo)
            let global_cpu = sys.global_cpu_info().cpu_usage();

            // CPU del processo corrente
            if let Some(process) = sys.process(pid) {
                let cpu_usage = process.cpu_usage(); 
                let total_time = process.run_time(); 
                
                println!(
                    "[LOG] CPU processo: {:.2}% | Tempo run: {}s | CPU globale: {:.2}%",
                    cpu_usage,
                    total_time,
                    global_cpu
                );
            }

            // Aspetta 120 secondi
            thread::sleep(Duration::from_secs(120));
        }
    });
}