# Build bitstream แบบ non-project mode (ไม่มีไฟล์ .xpr) ผลทั้งหมดไปอยู่ใน build/<target>/
#
# รันจากที่ไหนก็ได้ (path อ้างจากตำแหน่งไฟล์นี้):
#   vivado -mode batch -source fpga/build.tcl -tclargs smoke
#   vivado -mode batch -source fpga/build.tcl -tclargs top
#
# ไฟล์ที่ต้องส่งกลับให้ทีมอ่าน: build/<target>/ ทั้งโฟลเดอร์ยกเว้น .bit
#   (โดยเฉพาะ vivado.log, timing_summary.rpt, utilization.rpt, drc.rpt, messages_summary.txt)

set part xc7a100tcsg324-1
set root [file normalize [file join [file dirname [info script]] ..]]

set target smoke
if {[llength $argv] > 0} { set target [lindex $argv 0] }

switch -- $target {
    smoke {
        set top     top_smoke
        set sources [list [file join $root rtl top_smoke.v]]
        set xdc     [file join $root constr smoke.xdc]
    }
    top {
        set top     top
        set sources {}
        foreach d {common single multi mem race io vga} {
            foreach f [glob -nocomplain [file join $root rtl $d *.v]] { lappend sources $f }
        }
        lappend sources [file join $root rtl clk_gen.v]
        lappend sources [file join $root rtl top.v]
        set xdc     [file join $root constr nexys_a7_100t.xdc]
    }
    default {
        puts "ERROR: unknown target '$target' (ใช้ smoke หรือ top)"
        exit 1
    }
}

set out [file join $root build $target]
file mkdir $out
cd $out

# ไฟล์ .mem ที่ $readmemh อ้างถึง ให้หาได้จากชื่อไฟล์เปล่าๆ (copy มาไว้ในโฟลเดอร์ที่รัน และ read_mem ให้ Vivado รู้จัก)
set mems [glob -nocomplain [file join $root mem *.mem]]
foreach f $mems { file copy -force $f $out }

puts "== target=$target top=$top part=$part"
puts "== out=$out"

foreach f $sources { read_verilog $f }
if {$target ne "smoke"} {
    foreach f $mems { read_mem [file join $out [file tail $f]] }
}
read_xdc $xdc

synth_design -top $top -part $part
report_utilization    -file utilization_synth.rpt

opt_design
place_design
route_design

report_timing_summary -file timing_summary.rpt -max_paths 20
report_utilization    -file utilization.rpt
report_drc            -file drc.rpt
report_methodology    -file methodology.rpt

# สรุปจำนวน warning/critical warning/error ให้อ่านง่าย
set fh [open messages_summary.txt w]
foreach sev {ERROR {CRITICAL WARNING} WARNING} {
    if {[catch {get_msg_config -count -severity $sev} n]} { set n "?" }
    puts $fh "$sev: $n"
}
if {[catch {get_property SLACK [get_timing_paths -max_paths 1 -nworst 1 -setup]} wns]} { set wns "?" }
puts $fh "WNS (setup slack, ns): $wns"
close $fh

write_bitstream -force ${top}.bit
puts "== DONE: [file join $out ${top}.bit]"
