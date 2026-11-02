# main.py
# Entry point for the CPU simulator

from cpu import CPU
from memory import Memory

def load_instructions(filename):
    """
    Load instructions froma a text file.
    Each line is one instruction.
    """
    with open(filename, "r") as file: 
        return [line.strip() for line in file if line.strip()]

def main():
    # Load instruction from file 
    instructions = load_instructions("instructions.txt")

    #create memory
    memory = Memory()

    #create CPU
    cpu = CPU(instructions, memory)

    #run the CPU
    cpu.run()

# Only run main() if this file is excutec directly (not imported as a module)
if __name__ == "__main__":
    main()