import time

from .interclub_analysis_service import run_due_analyses


def main():
    while True:
        try:
            count = run_due_analyses()
            if count:
                print(f"Interclub analyses: {count} rencontre(s) traitée(s)", flush=True)
        except Exception as exc:
            print(f"Interclub analysis worker: {type(exc).__name__}", flush=True)
        # Align every check to the start of a minute, including the 22:00–00:00 slots in Réunion.
        time.sleep(max(1, 60 - time.time() % 60))


if __name__ == "__main__":
    main()
