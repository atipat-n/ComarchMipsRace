# โหลด bitstream ลงบอร์ดที่ต่อ USB อยู่ (ลงใน FPGA เท่านั้น ถอดไฟแล้วหาย ยังไม่เขียน flash)
#   vivado -mode batch -source fpga/program.tcl -tclargs smoke
#   vivado -mode batch -source fpga/program.tcl -tclargs top

set root [file normalize [file join [file dirname [info script]] ..]]
set target smoke
if {[llength $argv] > 0} { set target [lindex $argv 0] }
set top [expr {$target eq "smoke" ? "top_smoke" : "top"}]
set bit [file join $root build $target ${top}.bit]

if {![file exists $bit]} {
    puts "ERROR: ไม่พบ $bit ให้รัน build.tcl ก่อน"
    exit 1
}

open_hw_manager
connect_hw_server
open_hw_target
set dev [lindex [get_hw_devices xc7a100t*] 0]
current_hw_device $dev
set_property PROGRAM.FILE $bit $dev
program_hw_devices $dev
puts "== programmed $bit"
close_hw_manager
