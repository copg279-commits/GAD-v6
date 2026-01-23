import os
import re
import glob

# --- CONFIGURACIÓN DE LAS VERSIONES ---

# Patrón (versión V4) a buscar. Usamos la API Key y Project ID específicos de V4 como anclas.
FIREBASE_V4_PATTERN = re.compile(r"""
    const\s+firebaseConfig\s*=\s*\{.*?
    apiKey\s*:\s*"AIzaSyCY8V_P7m8lZUvGbMVlGaa-GVhbmyikmag".*?
    projectId\s*:\s*"gad-alicante-v4".*?
    \}[;]? # Cierra la llave, opcionalmente acepta un punto y coma final
""", re.VERBOSE | re.DOTALL)

# Configuración (versión V3) de reemplazo.
FIREBASE_V3_CONFIG = """
    const firebaseConfig = {
        apiKey: "AIzaSyA6EDUJ2dG50DphB-dF6GLi3P2IlW8lDl4",
        authDomain: "gad-alicante-v3.firebaseapp.com",
        databaseURL: "https://gad-alicante-v3-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "gad-alicante-v3",
        storageBucket: "gad-alicante-v3.appspot.com",
        messagingSenderId: "906986258369",
        appId: "1:906986258369:web:21a7ea29a33b5f395e3940"
    }
"""

def actualizar_archivo_html(ruta_archivo):
    """Detecta y reemplaza la configuración de Firebase V4 por la V3 en un archivo."""
    try:
        # 1. Leer el contenido del archivo
        with open(ruta_archivo, 'r', encoding='utf-8') as f:
            contenido = f.read()

        # 2. Buscar el patrón de V4 de forma flexible
        match = FIREBASE_V4_PATTERN.search(contenido)

        if match:
            print(f"✅ Configuración V4 detectada y seleccionada para reemplazo en: {ruta_archivo}")

            # 3. Realizar el reemplazo usando la coincidencia encontrada
            nuevo_contenido = contenido[:match.start()] + FIREBASE_V3_CONFIG + contenido[match.end():]

            # 4. Escribir el nuevo contenido en el archivo
            with open(ruta_archivo, 'w', encoding='utf-8') as f:
                f.write(nuevo_contenido)
            
            print(f"   -> Retrocedido a V3 correctamente.")
            return True
        else:
            # Reviso si contiene el 'projectId' de la V3, para evitar reportar archivos ya retrocedidos
            if "gad-alicante-v3" in contenido:
                print(f"✅ Archivo parece estar ya en V3: {ruta_archivo}")
            else:
                print(f"🔍 No se detectó la configuración V4 en: {ruta_archivo}")
            return False

    except Exception as e:
        print(f"❌ Error al procesar el archivo {ruta_archivo}: {e}")
        return False

def main():
    """Función principal para iterar sobre todos los archivos HTML."""
    archivos_html = glob.glob('*.html')
    archivos_actualizados = 0

    if not archivos_html:
        print("🛑 No se encontraron archivos .html en la carpeta actual.")
        return

    print(f"--- Iniciando búsqueda y reemplazo (V4 a V3) en {len(archivos_html)} archivos HTML ---")
    print("-------------------------------------------------------------------------------------")

    for archivo in archivos_html:
        if actualizar_archivo_html(archivo):
            archivos_actualizados += 1

    print("-------------------------------------------------------------------------------------")
    print(f"✨ Proceso finalizado. Se retrocedieron {archivos_actualizados} archivos a Firebase V3.")

if __name__ == "__main__":
    main()