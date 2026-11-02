#memory.py
#simualates main memory for the CPU

class Memory:
    def __init__(self):
        #Dictionary to store memory values
        #Key -> address
        #value -> data stored at that address
        self.data = {}

    def read(self, address):
        """
        Return tha value at a given memory address.
        If the address has never been written to,
        return 0 (default memory behavior).
        """
        return self.data.get(address, 0)
    
    def write(self, address, value):
        """
        write a value to a given memory address.
        """
        self.data[address] = value 

    def dump(self, start=0, width=20):
        #print("Memory:", self.data)
        print("Memory:")
        for i in range(start, start+100):
            if (i-start)%width==0:
                if i!=start: print()
                print(f"{hex(i)[2:]:>8}: ", end="")
            print(("0"+hex(self.data.get(i,0))[2:])[-2:], end=" ")
        print()

if __name__ == "__main__":
    a = Memory()
    a.write(120,20)
    a.dump(int('0x2000',16))

    
