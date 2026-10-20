from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

mimetypes.add_type("text/javascript", ".mjs", strict=True)
mimetypes.add_type("application/wasm", ".wasm", strict=True)
mimetypes.add_type("application/octet-stream", ".task", strict=True)


def main():
    parser = ArgumentParser(description="Servidor local de desarrollo de Kinima.")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Kinima disponible en http://127.0.0.1:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()