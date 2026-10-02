from app.services.zendesk_sync_service import run_incremental_sync


if __name__ == "__main__":
    resultado = run_incremental_sync()
    print(resultado)
