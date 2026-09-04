package main

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

func main() {
	executable, err := os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	executable, err = filepath.EvalSymlinks(executable)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	root := filepath.Dir(executable)
	node := filepath.Join(root, "runtime", "node")
	entry := filepath.Join(root, "bin", "zcode.js")
	args := append([]string{node, entry}, os.Args[1:]...)
	if err := syscall.Exec(node, args, os.Environ()); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
