package main

import (
	"bufio"
	"bytes"
	"os"
	"os/exec"
	"regexp"
	"strconv"
)

// getAndroidAPILevel 获取Android API等级
func getAndroidAPILevel() int {
	cmd := exec.Command("getprop", "ro.build.version.sdk")
	out, err := cmd.Output()
	if err != nil {
		// 如果获取失败，默认使用Android 13的API等级(33)
		return 33
	}

	// 解析API等级
	sdkStr := bytes.TrimSpace(out)
	level, err := strconv.Atoi(string(sdkStr))
	if err != nil {
		// 解析失败，默认使用33
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
			// 默认值是 0 (Go int 的零值)，如果用户指定 -n 1，这里会正确解析
			numArg, _ = strconv.Atoi(os.Args[i+1])
		}
	}

	if cmdArg == "" {
		os.Stderr.Write([]byte("Missing AT command (-c)\n"))
		os.Exit(1)
	}

	// ------------------- [!! 修改点 !!] -------------------
	//
	// 旧的 (安卓13) 命令:
	// quotedCmd := strconv.Quote("sendAt " + strconv.Itoa(numArg) + " " + cmdArg)
	// cmdString := `/system/bin/service call vendor.sprd.hardware.log.ILogControl/default 1 s16 "miscserver" s16 ` + quotedCmd
	//
	// 新的 (安卓15) 命令 (基于 Frida hook 和 IToolControl.java):
	// 服务: vendor.sprd.hardware.tool.IToolControl/default
	// 事务码: 3 (对应 sendAtCmd)
	// 参数1: i32 (phoneId)
	// 参数2: s16 (at command)
	//
	// 我们不再需要 "miscserver" 或 "sendAt" 字符串，直接传递纯 AT 命令

	// 根据Android API等级选择合适的命令字符串
	var cmdString string
	if getAndroidAPILevel() > 33 {
		// Android 14+ (API > 33): 使用新的 IToolControl 接口
		cmdString = "/system/bin/service call vendor.sprd.hardware.tool.IToolControl/default 3 i32 " +
			strconv.Itoa(numArg) +
			" s16 " +
			strconv.Quote(cmdArg)
	} else {
		// Android 13及以下 (API <= 33): 使用旧的 ILogControl 接口
		cmdString = `/system/bin/service call vendor.sprd.hardware.log.ILogControl/default 1 s16 "miscserver" s16 ` +
			strconv.Quote("sendAt "+strconv.Itoa(numArg)+" "+cmdArg)
	}
	// ----------------------------------------------------

	// 执行命令
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
