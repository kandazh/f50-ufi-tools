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
		return "", fmt.Errorf("IMEI%d marker not found", index)
	}

	// Extract data after the marker
	dataAfterMarker := hexContent[pos+len(marker):]

	// Find the first non-00 16-character (8-byte) data block
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
		return "", fmt.Errorf("IMEI%d data not found", index)
	}

	// Decode IMEI (reverse nibble according to original Shell script logic)
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
	// Remove leading 'a' (may be filler)
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

	// Declare err variable
	var err error

	// Write request
	_, err = port.Write(req)
	if err != nil {
		log.Fatalf("Write failed: %v", err)
	}

	// Read response
	buf := make([]byte, 512)
	n, err := port.Read(buf)
	if err != nil {
		log.Fatalf("Read failed: %v", err)
	}
	return hex.EncodeToString(buf[:n])
}

func main() {
	// Serial port configuration
	config := &serial.Config{
		Name:        "/dev/sdiag_nr",
		Baud:        115200,
		ReadTimeout: time.Millisecond * 300,
	}

	port, err := serial.OpenPort(config)
	if err != nil {
		log.Fatalf("Failed to open serial port: %v", err)
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
			fmt.Printf("%s parsing failed: %v\n", req.name, err)
			continue
		}
		fmt.Printf("%s:%s\n", req.name, imei)
	}

}
