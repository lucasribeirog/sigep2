const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  pathToFileURL,
} = require('url');

const {
  execFile,
} = require('child_process');

const {
  promisify,
} = require('util');


const execFileAsync =
  promisify(execFile);


function localizarLibreOffice() {

  if (process.platform === 'win32') {

    const candidatos = [

      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',

      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',

    ];


    for (const candidato of candidatos) {

      if (fs.existsSync(candidato)) {
        return candidato;
      }

    }


    /*
     * Caso o LibreOffice esteja no PATH.
     */
    return 'soffice.exe';
  }


  /*
   * Render / Debian.
   */
  return 'libreoffice';
}


async function converterDocxParaPdf(
  docxPath,
  outputDir
) {

  if (!docxPath) {
    throw new Error(
      'Caminho do DOCX não informado.'
    );
  }


  if (!outputDir) {
    throw new Error(
      'Diretório de saída do PDF não informado.'
    );
  }


  await fs.promises.mkdir(
    outputDir,
    {
      recursive: true,
    }
  );


  /*
   * Perfil próprio do LibreOffice.
   *
   * Evita lock de profile e restos de uma execução anterior.
   */
  const profileDir =
    await fs.promises.mkdtemp(
      path.join(
        os.tmpdir(),
        'nexus-libreoffice-'
      )
    );


  const userInstallation =
    pathToFileURL(
      profileDir
    ).href;


  const executavel =
    localizarLibreOffice();


  try {

    const {
      stdout,
      stderr,
    } =
      await execFileAsync(
        executavel,
        [
          `-env:UserInstallation=${userInstallation}`,

          '--headless',
          '--nologo',
          '--nodefault',
          '--nofirststartwizard',
          '--nolockcheck',

          '--convert-to',
          'pdf:writer_pdf_Export',

          '--outdir',
          outputDir,

          docxPath,
        ],
        {
          timeout: 120000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        }
      );


    if (stdout?.trim()) {

      console.log(
        '[LibreOffice]',
        stdout.trim()
      );

    }


    if (stderr?.trim()) {

      console.warn(
        '[LibreOffice stderr]',
        stderr.trim()
      );

    }


    const nomePdf =
      `${path.basename(
        docxPath,
        path.extname(docxPath)
      )}.pdf`;


    const pdfPath =
      path.join(
        outputDir,
        nomePdf
      );


    if (!fs.existsSync(pdfPath)) {

      const erro =
        new Error(
          `LibreOffice terminou sem gerar o PDF esperado: ${nomePdf}`
        );


      erro.codigo =
        'PDF_NAO_GERADO';


      throw erro;
    }


    return pdfPath;

  } finally {

    await fs.promises.rm(
      profileDir,
      {
        recursive: true,
        force: true,
      }
    ).catch(() => {});

  }

}


module.exports = {
  converterDocxParaPdf,
};