const { execFile } = require('child_process');
const path = require('path');

function medirComEscala(caminhoImagem) {
    return new Promise((resolve, reject) => {
        // Aponta para o script Python recém-criado
        const scriptPath = path.join(__dirname, '../scripts/processa_escala.py');
        
        execFile(process.env.PYTHON_BIN || 'python', [scriptPath, caminhoImagem], (error, stdout, stderr) => {
            if (error) {
                console.error(`Erro no script Python: ${stderr}`);
                return reject(error);
            }
            try {
                // Converte a string impressa pelo Python em um Objeto JS
                const medidas = JSON.parse(stdout.trim());
                resolve(medidas);
            } catch (e) {
                reject(new Error("Falha ao interpretar retorno do Python"));
            }
        });
    });
}

module.exports = { medirComEscala };