namespace SmartOffice.Modules.Biometrics.Domain;

/// <summary>
/// Các phép tính toán hình học trên Vector đặc trưng khuôn mặt (512 chiều).
/// </summary>
public static class BiometricMath
{
    public const float DuplicateThreshold = 0.85f;
    public const float MatchThreshold = 0.70f;
    public const float MinQualityScore = 100.0f;

    /// <summary>
    /// Tính độ tương đồng Cosine giữa 2 vector đặc trưng khuôn mặt.
    /// Kết quả nằm trong khoảng [-1.0, 1.0], càng gần 1.0 thì 2 khuôn mặt càng giống nhau.
    /// </summary>
    public static float CosineSimilarity(float[] vectorA, float[] vectorB)
    {
        if (vectorA.Length == 0 || vectorB.Length == 0 || vectorA.Length != vectorB.Length)
        {
            return 0f;
        }

        double dotProduct = 0.0;
        double normA = 0.0;
        double normB = 0.0;

        for (int i = 0; i < vectorA.Length; i++)
        {
            dotProduct += vectorA[i] * vectorB[i];
            normA += vectorA[i] * vectorA[i];
            normB += vectorB[i] * vectorB[i];
        }

        if (normA <= 0.0 || normB <= 0.0)
        {
            return 0f;
        }

        return (float)(dotProduct / (Math.Sqrt(normA) * Math.Sqrt(normB)));
    }
}
