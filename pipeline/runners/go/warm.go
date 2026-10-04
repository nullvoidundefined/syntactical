// Built once at image build time to warm the standard library build cache. Never run.
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"math"
	"net"
	"os"
	"reflect"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode"
	"unicode/utf8"
)

var _ = []any{
	bufio.NewReader, bytes.NewBuffer, context.Background, json.Marshal, errors.New, io.Copy,
	maps.Keys[map[int]int], math.Abs, net.Dial, os.Exit, reflect.TypeOf, slices.Sort[[]int],
	sort.Ints, strconv.Itoa, strings.ToUpper, sync.NewCond, atomic.AddInt64, time.Now,
	unicode.IsUpper, utf8.RuneLen,
}

func main() { fmt.Println() }
