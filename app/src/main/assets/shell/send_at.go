package main

import (
	"bufio"
	"bytes"
	"os"
	"os/exec"
	"regexp"
	"strconv"
)

// getAndroidAPILevel gets the Android API level
func getAndroidAPILevel() int {
	cmd := exec.Command("getprop", "ro.build.version.sdk")
	out, err := cmd.Output()
	if err != nil {
		// If retrieval fails, default to Android 13 API level (33)
		return 33
	}

	// Parse API level
	sdkStr := bytes.TrimSpace(out)
	level, err := strconv.Atoi(string(sdkStr))
	if err != nil {
		// Parse failed, default to 33
		return 33
	}
	return level
}

func parse(input string) string {
	hexWordPattern := regexp.MustCompile(`\b[0-9a-fA-F]{8}\b`)
	var result bytes.Buffer

	scanner := bufio.NewScanner(bytes.NewBufferString(input))
	for scanner.Scan() {
		line := scanner.Text()
		if idx := bytes.IndexRune([]byte(line), '\''); idx != -1 {
			line = line[:idx]
		}
		matches := hexWordPattern.FindAllString(line, -1)
		for _, word := range matches {
			if len(word) != 8 {
				continue
			}
			bytesLE := []string{
				word[6:8],
				word[4:6],
				word[2:4],
				word[0:2],
			}
			for i := 0; i < 4; i += 2 {
				b1, _ := strconv.ParseUint(bytesLE[i], 16, 8)
				b2, _ := strconv.ParseUint(bytesLE[i+1], 16, 8)
				r := rune(uint16(b2)<<8 | uint16(b1))
				if r >= 32 && r != 127 {
					result.WriteRune(r)
				}
			}
		}
	}
	return result.String()
}

func main() {
	if len(os.Args) < 3 {
		os.Stderr.Write([]byte("Usage: ./sendat -c <command> -n <0|1>\n"))
		os.Exit(1)
	}

	var cmdArg string
	var numArg int
	for i := 1; i < len(os.Args)-1; i++ {
		switch os.Args[i] {
		case "-c":
			cmdArg = os.Args[i+1]
		case "-n":
			// Default is 0 (Go int zero value), if user specifies -n 1, it will be parsed correctly here
			numArg, _ = strconv.Atoi(os.Args[i+1])
		}
	}

	if cmdArg == "" {
		os.Stderr.Write([]byte("Missing AT command (-c)\n"))
		os.Exit(1)
	}

	// ------------------- [!! MODIFICATION POINT !!] -------------------
	//
	// Old (Android 13) command:
	// quotedCmd := strconv.Quote("sendAt " + strconv.Itoa(numArg) + " " + cmdArg)
	// cmdString := `/system/bin/service call vendor.sprd.hardware.log.ILogControl/default 1 s16 "miscserver" s16 ` + quotedCmd
	//
	// New (Android 15) command (based on Frida hook and IToolControl.java):
	// Service: vendor.sprd.hardware.tool.IToolControl/default
	// Transaction code: 3 (corresponds to sendAtCmd)
	// Param 1: i32 (phoneId)
	// Param 2: s16 (at command)
	//
	// We no longer need the "miscserver" or "sendAt" strings, directly pass the raw AT command

	// Choose the appropriate command string based on Android API level
	var cmdString string
	if getAndroidAPILevel() > 33 {
		// Android 14+ (API > 33): Use the new IToolControl interface
		cmdString = "/system/bin/service call vendor.sprd.hardware.tool.IToolControl/default 3 i32 " +
			strconv.Itoa(numArg) +
			" s16 " +
			strconv.Quote(cmdArg)
	} else {
		// Android 13 and below (API <= 33): Use the old ILogControl interface
		cmdString = `/system/bin/service call vendor.sprd.hardware.log.ILogControl/default 1 s16 "miscserver" s16 ` +
			strconv.Quote("sendAt "+strconv.Itoa(numArg)+" "+cmdArg)
	}
	// ----------------------------------------------------

	// Execute command
	cmd := exec.Command("sh", "-c", cmdString)
	out, err := cmd.CombinedOutput()
	if err != nil {
		os.Stderr.Write([]byte("Shell error: " + err.Error() + "\n"))
		os.Stderr.Write(out)
		os.Exit(1)
	}

	parsed := parse(string(out))
	os.Stdout.Write([]byte(parsed + "\n"))
}
