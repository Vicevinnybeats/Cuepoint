;; Three-band mixer EQ, the WASM port of kernels/eq3.ts — same topology
;; (Linkwitz-Riley 4th order low/high, LR4 bandpass mid), same arithmetic
;; in the same order, so its output is bit-identical to the JS kernel.
;;
;; State block layout (bytes from $st), all f64:
;;   8 biquad sections x 56 bytes, each [b0 b1 b2 a1 a2 z1 z2]:
;;     0 lowA   56 lowB   112 midHpA  168 midHpB
;;     224 midLpA  280 midLpB  336 highA  392 highB
;;   3 smoothers x 24 bytes, each [current target coeff]:
;;     448 low gain   472 mid gain   496 high gain
;; Total 520 bytes. The audio buffer is f32, processed in place.
(module
  (memory (export "memory") 2)

  ;; Transposed direct form II, matching Biquad.tick exactly:
  ;;   y = b0*x + z1;  z1 = b1*x - a1*y + z2;  z2 = b2*x - a2*y
  (func $tick (param $s i32) (param $x f64) (result f64)
    (local $y f64)
    (local.set $y
      (f64.add
        (f64.mul (f64.load offset=0 (local.get $s)) (local.get $x))
        (f64.load offset=40 (local.get $s))))
    (f64.store offset=40 (local.get $s)
      (f64.add
        (f64.sub
          (f64.mul (f64.load offset=8 (local.get $s)) (local.get $x))
          (f64.mul (f64.load offset=24 (local.get $s)) (local.get $y)))
        (f64.load offset=48 (local.get $s))))
    (f64.store offset=48 (local.get $s)
      (f64.sub
        (f64.mul (f64.load offset=16 (local.get $s)) (local.get $x))
        (f64.mul (f64.load offset=32 (local.get $s)) (local.get $y))))
    (local.get $y))

  ;; One-pole smoother step, matching SmoothedValue.next exactly.
  (func $next (param $p i32) (result f64)
    (local $cur f64)
    (local $tgt f64)
    (local.set $tgt (f64.load offset=8 (local.get $p)))
    (local.set $cur
      (f64.add
        (local.get $tgt)
        (f64.mul
          (f64.sub (f64.load (local.get $p)) (local.get $tgt))
          (f64.load offset=16 (local.get $p)))))
    (if (f64.lt (f64.abs (f64.sub (local.get $cur) (local.get $tgt))) (f64.const 1e-9))
      (then (local.set $cur (local.get $tgt))))
    (f64.store (local.get $p) (local.get $cur))
    (local.get $cur))

  (func (export "eq3_process") (param $st i32) (param $buf i32) (param $frames i32)
    (local $i i32)
    (local $p i32)
    (local $x f64)
    (local $low f64)
    (local $mid f64)
    (local $high f64)
    (local.set $p (local.get $buf))
    (block $done
      (loop $loop
        (br_if $done (i32.ge_u (local.get $i) (local.get $frames)))
        (local.set $x (f64.promote_f32 (f32.load (local.get $p))))
        (local.set $low
          (call $tick (i32.add (local.get $st) (i32.const 56))
            (call $tick (local.get $st) (local.get $x))))
        (local.set $mid
          (call $tick (i32.add (local.get $st) (i32.const 280))
            (call $tick (i32.add (local.get $st) (i32.const 224))
              (call $tick (i32.add (local.get $st) (i32.const 168))
                (call $tick (i32.add (local.get $st) (i32.const 112)) (local.get $x))))))
        (local.set $high
          (call $tick (i32.add (local.get $st) (i32.const 392))
            (call $tick (i32.add (local.get $st) (i32.const 336)) (local.get $x))))
        (f32.store (local.get $p)
          (f32.demote_f64
            (f64.add
              (f64.add
                (f64.mul (local.get $low) (call $next (i32.add (local.get $st) (i32.const 448))))
                (f64.mul (local.get $mid) (call $next (i32.add (local.get $st) (i32.const 472)))))
              (f64.mul (local.get $high) (call $next (i32.add (local.get $st) (i32.const 496)))))))
        (local.set $p (i32.add (local.get $p) (i32.const 4)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop))))
)
