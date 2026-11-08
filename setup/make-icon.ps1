$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$image = [Drawing.Image]::FromFile($env:WINTERMAS_ICON_SOURCE)
$frames = @()
try {
  foreach ($size in 16, 24, 32, 48, 64, 128, 256) {
    $bitmap = New-Object Drawing.Bitmap($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $stream = New-Object IO.MemoryStream
    try {
      $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $ratio = $size / [Math]::Max($image.Width, $image.Height)
      $width = [int][Math]::Round($image.Width * $ratio)
      $height = [int][Math]::Round($image.Height * $ratio)
      $graphics.DrawImage($image, [int](($size - $width) / 2), [int](($size - $height) / 2), $width, $height)
      $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
      $frames += @{ Size = $size; Bytes = $stream.ToArray() }
    } finally {
      $stream.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally { $image.Dispose() }

$file = [IO.File]::Create($env:WINTERMAS_ICON_OUTPUT)
$writer = New-Object IO.BinaryWriter($file)
try {
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]$frames.Count)
  $offset = 6 + 16 * $frames.Count
  foreach ($frame in $frames) {
    $writer.Write([byte]($frame.Size % 256))
    $writer.Write([byte]($frame.Size % 256))
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$frame.Bytes.Length)
    $writer.Write([UInt32]$offset)
    $offset += $frame.Bytes.Length
  }
  foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
} finally { $writer.Dispose() }
