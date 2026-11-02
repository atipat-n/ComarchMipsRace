# CPU Simulator (Python)

Beginner project — Python CPU simulator for CS104: Computer Architecture (Codecademy).

## Features
- Simulates a simple CPU with registers and program counter
- Supports MIPS-style instructions:
  - ADD, ADDI
  - LW, SW
  - BEQ
  - HALT
- Implements fetch–decode–execute cycle
- Includes main memory simulation
- Handles branching and PC bounds safely

## Project Structure
- `cpu.py` – CPU logic and instruction execution
- `memory.py` – Main memory simulation
- `isa.py` – Instruction parsing
- `main.py` – Program entry point
- `instructions.txt` – Sample instruction file

## How to Run
```bash
python main.py
