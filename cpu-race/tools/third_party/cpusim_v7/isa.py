# isa.py 
# Handles instruction parsing and decoding
allCMD=[
        ('ADD', 'R', '000000', '100000'),
        ('ADDI', 'I', '001000', '000000'),
        ('ADDIU', 'I', '001001', '000000'),
        ('ADDU', 'R', '000000', '100001'),
        ('AND', 'R', '000000', '100100'),
        ('ANDI', 'I', '001100', '000000'),
        ('BEQ', 'I', '000100', '000000'),
        ('BNE', 'I', '000101', '000000'),
        ('J', 'J', '000010', '000000'),
        ('JAL', 'J', '000011', '000000'),
        ('JR', 'R', '000000', '001000'),
        ('LBU', 'I', '100100', '000000'),
        ('LHU', 'I', '100101', '000000'),
        ('LL', 'I', '110000', '000000'),
        ('LUI', 'I', '001111', '000000'),
        ('LW', 'I', '100011', '000000'),
        ('NOR', 'R', '000000', '100111'),
        ('OR', 'R', '000000', '100101'),
        ('ORI', 'I', '001101', '000000'),
        ('SLT', 'R', '000000', '101010'),
        ('SLTI', 'I', '001010', '000000'),
        ('SLTIU', 'I', '001011', '000000'),
        ('SLTU', 'R', '000000', '101011'),
        ('SLL', 'R', '000000', '000000'),
        ('SRL', 'R', '000000', '000010'),
        ('SB', 'I', '101000', '000000'),
        ('SC', 'I', '111000', '000000'),
        ('SH', 'I', '101001', '000000'),
        ('SW', 'I', '101011', '000000'),
        ('SUB', 'R', '000000', '100010'),
        ('SUBU', 'R', '000000', '100011'),
        ]
# change allCMD to cmdDict
cmdDict={'ADD': ('ADD', 'R', '000000', '100000'), 'ADDI': ('ADDI', 'I', '001000', '000000'), 'ADDIU': ('ADDIU', 'I', '001001', '000000'), 'ADDU': ('ADDU', 'R', '000000', '100001'), 'AND': ('AND', 'R', '000000', '100100'), 'ANDI': ('ANDI', 'I', '001100', '000000'), 'BEQ': ('BEQ', 'I', '000100', '000000'), 'BNE': ('BNE', 'I', '000101', '000000'), 'J': ('J', 'J', '000010', '000000'), 'JAL': ('JAL', 'J', '000011', '000000'), 'JR': ('JR', 'R', '000000', '001000'), 'LBU': ('LBU', 'I', '100100', '000000'), 'LHU': ('LHU', 'I', '100101', '000000'), 'LL': ('LL', 'I', '110000', '000000'), 'LUI': ('LUI', 'I', '001111', '000000'), 'LW': ('LW', 'I', '100011', '000000'), 'NOR': ('NOR', 'R', '000000', '100111'), 'OR': ('OR', 'R', '000000', '100101'), 'ORI': ('ORI', 'I', '001101', '000000'), 'SLT': ('SLT', 'R', '000000', '101010'), 'SLTI': ('SLTI', 'I', '001010', '000000'), 'SLTIU': ('SLTIU', 'I', '001011', '000000'), 'SLTU': ('SLTU', 'R', '000000', '101011'), 'SLL': ('SLL', 'R', '000000', '000000'), 'SRL': ('SRL', 'R', '000000', '000010'), 'SB': ('SB', 'I', '101000', '000000'), 'SC': ('SC', 'I', '111000', '000000'), 'SH': ('SH', 'I', '101001', '000000'), 'SW': ('SW', 'I', '101011', '000000'), 'SUB': ('SUB', 'R', '000000', '100010'), 'SUBU': ('SUBU', 'R', '000000', '100011')}

def imm2int(imm):
    """
    convert immediate in either hex or dec string to int
    """
    if imm[:2] == '0x':
        return int(imm,16)
    else:
        return int(imm)

def reg2bin5(r):
    return ('0'*4+bin(r)[2:])[-5:]
    
class Instruction:
    def __init__(self, raw_line):
        """
        raw_line a single line from the instruction file
        Example: "ADD R1 R2 R3"
        """

        self.raw =  raw_line.strip()
        self.opcode = None 
        self.operands = []
        self.hexcmd = None

        self.decode()
        self.decode2()
        self.decode3()
        #print(self.hexcmd, self.raw)

    def decode(self):
        """
        Split the instrucion into opcode and operands
        """

        if not self.raw:
            return
        
        parts = self.raw.split()
        self.opcode = parts[0].upper()
        self.operands = parts[1:]
        
    def prepareTypeR(self):
        self.operands[0] = int(self.operands[0][1:]) # Destination register
        self.operands[1] = int(self.operands[1][1:]) # First source register
        self.operands[2] = int(self.operands[2][1:]) # Second source register
        pass

    def prepareTypeI(self):
        self.operands[0] = int(self.operands[0][1:]) # Destination register
        self.operands[1] = int(self.operands[1][1:]) # First source register
        self.operands[2] = imm2int(self.operands[2])     # Immediate value
        pass

    def prepareLoadStore(self):
        self.operands[0] = int(self.operands[0][1:]) # Register conatainin the value to store

        offset_reg = self.operands[1] # Format: offset(rs)
        self.operands[1] = int(offset_reg.split("(")[1][1:-1])  # rt = base register
        self.operands.append(int(offset_reg.split("(")[0]))     # offset

    def prepareLoadUpper(self):
        self.operands[0] = int(self.operands[0][1:]) # Destination register
        self.operands[1] = imm2int(self.operands[1]) & 0xffff    # Immediate value

    def prepareTypeAddr(self):
        self.operands[0] = imm2int(self.operands[0])

    def decode2(self):
        """
        detect type of instruction and prepare rs rt rd immediate
        """
        match self.opcode:
            case 'ADD' | 'ADDU' | 'AND' | 'NOR' | 'OR' | 'SLT' | 'SLTU' | 'SUB' | 'SUBU' :
                #print("Preparing R format")
                self.prepareTypeR()
            case 'JR':
                #print("Preparing R JR cmnd")
                pass
            case 'SLL' | 'SRL' :
                #print("Preparing R Shift cmnd")
                pass
            case 'ADDI' | 'ADDIU' | 'ANDI' | 'ORI' | 'SLTI' | 'SLTIU' | 'BEQ' | 'BNE':
                #print("Preparing I format")
                self.prepareTypeI()
            case 'LBU' | 'LHU' | 'LL' | 'LW' | 'SB' | 'SC' | 'SH' | 'SW' :
                #print("Preparing I Load/Store cmnd")
                self.prepareLoadStore()
            case 'LUI' :
                #print("Preparing LUI cmnd")
                self.prepareLoadUpper()
                pass
            case 'J' | 'JAL' :
                #print("Preparing J format")
                self.prepareTypeAddr()
            case 'HALT' :
                pass #print("HALT cmnd")
            case '.ORG' :
                self.prepareTypeAddr()
                pass #change PC
            case _:
                print("error unknown opcode")
                exit(1)

    
    def decode3(self):
        """
        Assemble instruction to machine code (8 digit of hex in string)
        """
        opr = self.operands
        
        if self.opcode[0] != '.' and self.opcode != 'HALT':
            word = (cmdDict[self.opcode])[2]  # get 6bit bin opcode from dict

            if self.opcode in ['ADDI', 'ANDI', 'ORI', 'SLTI', 'SLTIU', 'LUI', 'BEQ', 'BNE', 'SW' , 'LW']:
                if self.opcode == 'LUI':
                    rt,rs,imm = opr[0], 0, opr[1]
                else:
                    rt,rs,imm = opr[0], opr[1], opr[2]
                if imm < 0:
                    imm = (2**16 + imm) # convert to 2 implement
                word += reg2bin5(rs) + reg2bin5(rt) + ('0'*15 + bin(imm)[2:])[-16:]
            elif self.opcode in ['J', 'JAL']:
                addr = opr[0] >> 2
                word += ('0'*25 + bin(addr)[2:])[-26:]
            else:
                word = word + '0'*26
            self.hexcmd =  (hex(int(('1' + word),2))[3:])


if  __name__ == "__main__":
    instructions = []
    with open("instructions.txt", "r") as file: 
         instructions.extend([line.strip() for line in file if line.strip()])
    #print("\n".join(instructions))
    instructions = [
            Instruction(line) for line in instructions
        ]
    for inst in instructions:
        inst.decode2()
        inst.decode3()
        if inst.opcode[0] != '.' and inst.opcode != 'HALT':
            print(inst.raw,'\t',inst.opcode, inst.operands, inst.hexcmd)
        else:
            print(inst.raw,'\t',inst.opcode, inst.operands, inst.hexcmd)
        
    
