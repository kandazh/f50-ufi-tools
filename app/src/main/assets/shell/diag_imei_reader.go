package main

import (
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/tarm/serial"
)

func extractIMEI(hexContent string, index int) (string, error) {
	marker := "74005e01"
	pos := strings.Index(hexContent, marker)
	if pos == -1 {
		return "", fmt.Errorf("未找到IMEI%d特征", index)
	}

	// 提取 marker 之后的数据
	dataAfterMarker := hexContent[pos+len(marker):]

	// 查找第一个非00的16字符（8字节）数据块
	var foundData string
	for i := 0; i+16 <= len(dataAfterMarker); i += 2 {
		chunk := dataAfterMarker[i : i+16]
		if strings.HasPrefix(chunk, "00") {
			continue
		}
		foundData = chunk
		break
	}
	if foundData == "" {
		return "", fmt.Errorf("未找到IMEI%d数据", index)
	}

	// 解码 IMEI（按照原 Shell 脚本逻辑反转 nibble）
	var imei strings.Builder
	for i := 0; i < 16; i += 2 {
		if i+2 > len(foundData) {
			break
		}
		high := string(foundData[i])
		low := string(foundData[i+1])
		imei.WriteString(low)
		imei.WriteString(high)
	}

	result := imei.String()
	// 去掉开头的 a（可能是 filler）
	if strings.HasPrefix(result, "a") || strings.HasPrefix(result, "A") {
		result = result[1:]
	}
	if len(result) > 15 {
		result = result[:15]
	}
	return result, nil
}

func getHex(port *serial.Port, hexString string) string {
	reqHex := hexString
	req, _ := hex.DecodeString(reqHex)

	// 声明 err 变量
	var err error

	// 写入请求
	_, err = port.Write(req)
	if err != nil {
		log.Fatalf("写入失败: %v", err)
	}

	// 读取响应
	buf := make([]byte, 512)
	n, err := port.Read(buf)
	if err != nil {
		log.Fatalf("读取失败: %v", err)
	}
	return hex.EncodeToString(buf[:n])
}

func main() {
	// 串口配置
	config := &serial.Config{
		Name:        "/dev/sdiag_nr",
		Baud:        115200,
		ReadTimeout: time.Millisecond * 300,
	}

	port, err := serial.OpenPort(config)
	if err != nil {
		log.Fatalf("打开串口失败: %v", err)
	}

	defer port.Close()

	reqs := []struct {
		name string
		hex  string
	}{
		{"IMEI1", "7E000000000A005E8100007E"},
		{"IMEI2", "7E000000000A005E8200007E"},
		{"IMEI3", "7E000000000A005E9000007E"},
	}

	for i, req := range reqs {
		respHex := getHex(port, req.hex)
		imei, err := extractIMEI(respHex, i+1)
		if err != nil {
			fmt.Printf("%s 解析失败: %v\n", req.name, err)
			continue
		}
		fmt.Printf("%s:%s\n", req.name, imei)
	}

}
